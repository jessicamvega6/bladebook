// One website: a private S3 bucket behind its own CloudFront distribution on its own host.
// The coach and family websites are separate hosts (owner, 2026-11-16) so the browser keeps
// each site's sign-in apart from the other's.
//
// The /api/* behaviour sends API calls to API Gateway on the same host, with the origin secret (ADR-019, I1). Both
// behaviours refuse visitors outside the United States with a CloudFront Function (ADR-019, amended 2026-11-17).
// Not here yet: uploading the Vite build with its cache headers (the deploy workflow).

import { Duration, RemovalPolicy, Stack, Validations } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { SiteConfig } from './config.ts';
import type { Api } from './api.ts';
import { ORIGIN_HEADER, STAGE } from './api.ts';

export interface WebsiteProps {
  readonly site: SiteConfig;
  readonly zone: route53.IHostedZone;
  readonly noindex: boolean;
  readonly removalPolicy: RemovalPolicy;
  /** Sends `/api/*` to the API. */
  readonly api?: Api;
}

/** The header the API's firewall counts by: the visitor's address, written by CloudFront, never the visitor (I1). */
export const VIEWER_IP_HEADER = 'x-bladebook-viewer-ip';

/**
 * Where BladeBook is open: the United States and its territories, by CloudFront's country code (ADR-019, amended
 * 2026-11-17: US only). Puerto Rico, Guam, the US Virgin Islands, American Samoa, the Northern Mariana Islands and the
 * minor outlying islands have their own codes.
 */
export const ALLOWED_COUNTRIES = ['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM'] as const;

export const REFUSAL_MESSAGE =
  'BladeBook is only available in the United States. If you\'re travelling, you can use it again when you\'re back.';

/**
 * The start of each viewer-request function: refuses a visitor outside the allowed countries. No country header means
 * CloudFront wasn't asked to pass it, so the visitor is refused too: a mistake shows at once instead of letting
 * everyone in. `api`: a short JSON answer; otherwise a plain page.
 */
function countryCheck(api: boolean): string {
  const body = api
    ? JSON.stringify(JSON.stringify({ message: REFUSAL_MESSAGE }))
    : JSON.stringify(refusalPage());
  const type = api ? 'application/json' : 'text/html; charset=utf-8';
  return `var ALLOWED = ${JSON.stringify(ALLOWED_COUNTRIES)};
function refused(request) {
  var c = request.headers['cloudfront-viewer-country'];
  return !c || ALLOWED.indexOf(c.value) === -1;
}
function refusal() {
  return { statusCode: 403, statusDescription: 'Forbidden',
    headers: { 'content-type': { value: '${type}' }, 'cache-control': { value: 'no-store' } },
    body: { encoding: 'text', data: ${body} } };
}
`;
}

function refusalPage(): string {
  const message = REFUSAL_MESSAGE;
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"><title>BladeBook</title>'
    + '<style>body{font-family:system-ui,sans-serif;margin:0;padding:48px 16px;background:#fff;color:#1b2733}'
    + 'main{max-width:32rem;margin:0 auto}h1{font-size:1.5rem}p{font-size:1.125rem;line-height:1.5}'
    + '@media (prefers-color-scheme:dark){body{background:#10171f;color:#e6edf3}}</style></head>'
    + `<body><main><h1>BladeBook</h1><p>${message}</p></main></body></html>`;
}

/** The site paths' viewer-request function: the country check, then each app's index.html for its pages. */
export function siteRequestCode(appRoots: readonly string[]): string {
  const start = 'function handler(event) {\n  var request = event.request;\n';
  const routing = spaRoutingCode(appRoots);
  if (!routing.includes(start)) throw new Error('spaRoutingCode changed: put the country check back in siteRequestCode');
  return countryCheck(false) + routing.replace(start, `${start}  if (refused(request)) { return refusal(); }\n`);
}

/**
 * The /api/* viewer-request function: the country check, then the visitor's address into `VIEWER_IP_HEADER`,
 * overwriting anything sent, and any origin header the visitor sent removed (CloudFront adds the real one).
 */
export function apiRequestCode(): string {
  return countryCheck(true) + `function handler(event) {
  var request = event.request;
  if (refused(request)) { return refusal(); }
  request.headers['${VIEWER_IP_HEADER}'] = { value: event.viewer.ip };
  delete request.headers['${ORIGIN_HEADER}'];
  return request;
}`;
}

/**
 * CloudFront Function (viewer request): a path with no file extension is a page of one of the
 * single-page apps, so it is served that app's index.html. Exported for the tests.
 */
export function spaRoutingCode(appRoots: readonly string[]): string {
  for (const root of appRoots) {
    if (!root.startsWith('/') || !root.endsWith('/')) {
      throw new Error(`app root must start and end with '/': ${root}`);
    }
  }
  return `var ROOTS = ${JSON.stringify(appRoots)};
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSlash = uri.lastIndexOf('/');
  if (uri.indexOf('.', lastSlash) !== -1) { return request; }
  for (var i = 0; i < ROOTS.length; i++) {
    var root = ROOTS[i];
    if (uri === root.slice(0, -1) || uri.indexOf(root) === 0) {
      request.uri = root + 'index.html';
      return request;
    }
  }
  return request;
}`;
}

export class Website extends Construct {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebsiteProps) {
    super(scope, id);
    const { site, zone } = props;

    // SSE-S3, not aws/s3: CloudFront's origin access control can't decrypt with an
    // AWS-managed KMS key. The bucket holds only the public build.
    this.bucket = new s3.Bucket(this, 'Bucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: props.removalPolicy,
      autoDeleteObjects: props.removalPolicy === RemovalPolicy.DESTROY,
    });

    // CloudFront's certificates must be in us-east-1; the stack's region is checked there.
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: site.host,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const headers = new cloudfront.ResponseHeadersPolicy(this, 'Headers', {
      comment: `${site.host} security headers`,
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(730),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()', override: true },
          ...(props.noindex ? [{ header: 'X-Robots-Tag', value: 'noindex, nofollow', override: true }] : []),
        ],
      },
    });

    const routing = new cloudfront.Function(this, 'SpaRouting', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(siteRequestCode(site.appRoots)),
      comment: `${site.host}: US only; serve each app's index.html for its pages`,
    });
    // A viewer-request function sees the country only if a policy passes it on (S3 ignores it).
    const country = new cloudfront.OriginRequestPolicy(this, 'Country', {
      comment: `${site.host}: pass the visitor's country, for the US-only check`,
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList('CloudFront-Viewer-Country'),
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: site.host,
      domainNames: [site.host],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: country,
        responseHeadersPolicy: headers,
        functionAssociations: [{ function: routing, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
    });

    if (props.api) {
      const apiRequest = new cloudfront.Function(this, 'ApiRequest', {
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        code: cloudfront.FunctionCode.fromInline(apiRequestCode()),
        comment: `${site.host}/api: US only; pass the visitor's address to the firewall`,
      });
      const { restApi, originSecret } = props.api;
      this.distribution.addBehavior('/api/*', new origins.HttpOrigin(
        `${restApi.restApiId}.execute-api.${Stack.of(this).region}.amazonaws.com`, {
          originPath: `/${STAGE}`,
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          // A CloudFormation dynamic reference: the value isn't in the template.
          customHeaders: { [ORIGIN_HEADER]: originSecret.secretValue.unsafeUnwrap() },
        }), {
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        // Every header but Host (API Gateway needs its own), with CloudFront's, including the country.
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: headers,
        functionAssociations: [{ function: apiRequest, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      });
    }

    const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution));
    new route53.ARecord(this, 'AliasA', { zone, recordName: site.host, target });
    new route53.AaaaRecord(this, 'AliasAAAA', { zone, recordName: site.host, target });

    Validations.of(this.bucket).acknowledge({
      id: 'AwsSolutions-S1',
      reason: 'Holds only the public website build; reads go through CloudFront. Object-level CloudTrail data events cover the data buckets (ADR-012 d5).',
    });
    Validations.of(this.distribution).acknowledge(
      { id: 'AwsSolutions-CFR1', reason: 'US only, by a CloudFront Function, not the built-in restriction, whose 403 page would replace the API\'s 403s (ADR-019, I1).' },
      { id: 'AwsSolutions-CFR2', reason: 'ADR-019 (I1): the one WAF is on the API stage and the user pool; a second on CloudFront costs too much for now.' },
      { id: 'AwsSolutions-CFR3', reason: 'Static files only; requests that matter are logged at the API and the WAF (ADR-012, ADR-019).' },
    );
  }
}
