// One website: a private S3 bucket behind its own CloudFront distribution on its own host.
// The coach and family websites are separate hosts (owner, 2026-11-16) so the browser keeps
// each site's sign-in apart from the other's.
//
// Not here yet (Batch 17b): uploading the Vite build with its cache headers, and the /api/*
// behaviour that sends API calls to API Gateway on the same host.

import { Duration, RemovalPolicy, Validations } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { SiteConfig } from './config.ts';

export interface WebsiteProps {
  readonly site: SiteConfig;
  readonly zone: route53.IHostedZone;
  readonly noindex: boolean;
  readonly removalPolicy: RemovalPolicy;
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
      code: cloudfront.FunctionCode.fromInline(spaRoutingCode(site.appRoots)),
      comment: `${site.host}: serve each app's index.html for its pages`,
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
        responseHeadersPolicy: headers,
        functionAssociations: [{ function: routing, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
    });

    const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution));
    new route53.ARecord(this, 'AliasA', { zone, recordName: site.host, target });
    new route53.AaaaRecord(this, 'AliasAAAA', { zone, recordName: site.host, target });

    Validations.of(this.bucket).acknowledge({
      id: 'AwsSolutions-S1',
      reason: 'Holds only the public website build; reads go through CloudFront. Object-level CloudTrail data events cover the data buckets (ADR-012 d5).',
    });
    Validations.of(this.distribution).acknowledge(
      { id: 'AwsSolutions-CFR1', reason: 'Families and coaches are in the US and Canada; no country is blocked.' },
      { id: 'AwsSolutions-CFR2', reason: 'ADR-019: the WAF is on the API stage and the user pool, not CloudFront. This serves only static files.' },
      { id: 'AwsSolutions-CFR3', reason: 'Static files only; requests that matter are logged at the API and the WAF (ADR-012, ADR-019).' },
    );
  }
}
