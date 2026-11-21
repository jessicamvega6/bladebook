// The application stack: built after the account stack, destroyed when dev's work is done
// (ADR-027, ADR-028). Batch 17a holds the websites, the data buckets and access log, SES and
// the firewall. Batch 17b adds the table (built from the seed import), the API, the functions,
// the event backbone and the scheduled jobs.

import { CfnOutput, Stack, Validations } from 'aws-cdk-lib';
import type { CfnElement } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ses from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';
import { dataRemovalPolicy, resourcePrefix } from './config.ts';
import type { EnvConfig } from './config.ts';
import { DataBuckets } from './data-buckets.ts';
import { Firewall } from './firewall.ts';
import { Alarms } from './alarms.ts';
import { Api } from './api.ts';
import { Consumers } from './consumers.ts';
import { Jobs } from './jobs.ts';
import { Email } from './email.ts';
import { BladebookTable } from './table.ts';
import { TenantRoles } from './tenant-roles.ts';
import { siteFiles, Website } from './website.ts';

export interface AppStackProps extends StackProps {
  readonly cfg: EnvConfig;
  readonly userPool: cognito.IUserPool;
  readonly coachAppClient: cognito.IUserPoolClient;
  readonly familyAppClient: cognito.IUserPoolClient;
  /** Dev: the account stack's seed bucket, which the table is imported from (ADR-028). */
  readonly seedBucket?: s3.IBucket;
  /** I26: the owner's phone for pages, and an address while US texts can't be sent. Deploy-time settings. */
  readonly pagePhone?: string;
  readonly pageEmail?: string;
}

export class AppStack extends Stack {
  readonly coachSite: Website;
  readonly familySite: Website;
  readonly data: DataBuckets;
  readonly firewall?: Firewall;
  readonly table: BladebookTable;
  readonly tenants: TenantRoles;
  readonly email?: Email;
  readonly api: Api;
  readonly consumers: Consumers;
  readonly jobs: Jobs;
  readonly alarms?: Alarms;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { cfg } = props;
    const prefix = resourcePrefix(cfg);
    if (this.region !== 'us-east-1') {
      // The websites' certificates are made in this stack, and CloudFront only reads us-east-1's.
      throw new Error(`${id} must be in us-east-1 (CloudFront certificates); got ${this.region}`);
    }
    const removalPolicy = dataRemovalPolicy(cfg);

    const zones = new Map<string, route53.IHostedZone>();
    const zoneFor = (name: string, zoneId?: string): route53.IHostedZone => {
      let zone = zones.get(name);
      if (!zone) {
        // The zones are made by hand and outlive every build (ADR-027 d8), so they're looked up.
        zone = zoneId
          ? route53.HostedZone.fromHostedZoneAttributes(this, `Zone-${name}`, { hostedZoneId: zoneId, zoneName: name })
          : route53.HostedZone.fromLookup(this, `Zone-${name}`, { domainName: name });
        zones.set(name, zone);
      }
      return zone;
    };

    this.data = new DataBuckets(this, 'Data', { prefix, removalPolicy });

    if (cfg.seedImport && !props.seedBucket) throw new Error(`${id}: seedImport needs the account stack's seed bucket`);
    this.table = new BladebookTable(this, 'Table', {
      tableName: prefix,
      removalPolicy,
      ...(cfg.seedImport ? { seedBucket: props.seedBucket } : {}),
    });

    // The database gate (ADR-MASTER §16): the API functions reach the table only through these.
    this.tenants = new TenantRoles(this, 'Tenants', { table: this.table.table, ...(cfg.gateTest ? { gateTest: { prefix } } : {}) });

    // SES's templates and sending addresses (ADR-MASTER §13); none until the environment has an email domain.
    this.email = cfg.emailDomain ? new Email(this, 'Email', { domain: cfg.emailDomain.name }) : undefined;

    this.api = new Api(this, 'Api', {
      prefix,
      table: this.table.table,
      tenants: this.tenants,
      accessLog: this.data.accessLog,
      userPool: props.userPool,
      issuer: `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
      coachAppClientId: props.coachAppClient.userPoolClientId,
      familyAppClientId: props.familyAppClient.userPoolClientId,
      coachSiteUrl: `https://${cfg.sites.coach.host}`,
      familySiteUrl: `https://${cfg.sites.family.host}`,
      ...(this.email ? { mail: { from: this.email.from, noReply: this.email.noReply } } : {}),
      removalPolicy,
    });
    // api-coach sends one email itself, the business-email confirmation (ADR-016; ADR-MASTER §2, I9).
    this.email?.sendOnly(this.tenants.apiCoachRole, ['business-email-confirmation']);

    // The event backbone: stream → Pipe → bus → one rule and consumer per event (ADR-MASTER §2, §3, I6).
    this.consumers = new Consumers(this, 'Consumers', {
      prefix,
      table: this.table.table,
      accessLog: this.data.accessLog,
      archive: this.data.archive,
      coachSiteUrl: `https://${cfg.sites.coach.host}`,
      familySiteUrl: `https://${cfg.sites.family.host}`,
      ...(this.email ? { email: this.email } : {}),
      removalPolicy,
    });

    // The scheduled jobs, on EventBridge Scheduler (ADR-MASTER §2, §14).
    this.jobs = new Jobs(this, 'Jobs', {
      prefix,
      table: this.table.table,
      accessLog: this.data.accessLog,
      coachSiteUrl: `https://${cfg.sites.coach.host}`,
      familySiteUrl: `https://${cfg.sites.family.host}`,
      ...(this.email ? { email: this.email } : {}),
      unpaidThresholdDays: cfg.unpaidThresholdDays,
      scheduleChange: this.consumers.functions.get('consumer-schedule-change')!,
      removalPolicy,
    });

    // What pages the owner, and the morning dashboard (ADR-MASTER §16, §19; I25, I26).
    if (cfg.alarms) {
      this.alarms = new Alarms(this, 'Alarms', {
        prefix,
        ...(props.pagePhone ? { pagePhone: props.pagePhone } : {}),
        ...(props.pageEmail ? { pageEmail: props.pageEmail } : {}),
        consumers: this.consumers.functions,
        consumerDeadLetters: this.consumers.deadLetters,
        jobs: this.jobs.functions,
        jobDeadLetters: this.jobs.deadLetters,
        pipe: this.consumers.pipe,
        pipeDeadLetters: this.consumers.pipeDeadLetters,
        ttlArchiver: this.consumers.ttlArchiver,
        accessLog: this.data.accessLog,
        postConfirmationName: `${prefix}-auth-post-confirmation`,
        // Production only (I26): in dev, switching alarms on proves them; the up-check costs per check.
        ...(cfg.retainData ? { upCheck: { siteHost: cfg.sites.coach.host, apiHost: cfg.sites.coach.host } } : {}),
      });
    }

    this.coachSite = new Website(this, 'CoachSite', {
      site: cfg.sites.coach,
      zone: zoneFor(cfg.sites.coach.zoneName, cfg.sites.coach.zoneId),
      noindex: cfg.noindex,
      csp: cfg.csp,
      removalPolicy,
      api: this.api,
      files: siteFiles(this, 'coach'),
    });
    this.familySite = new Website(this, 'FamilySite', {
      site: cfg.sites.family,
      zone: zoneFor(cfg.sites.family.zoneName, cfg.sites.family.zoneId),
      noindex: cfg.noindex,
      csp: cfg.csp,
      removalPolicy,
      api: this.api,
      files: siteFiles(this, 'family'),
    });
    acknowledgeSiteUpload(this, [this.coachSite.bucket, this.familySite.bucket]);


    if (cfg.emailDomain) {
      // DKIM records go in the zone; the identity starts in the SES sandbox.
      new ses.EmailIdentity(this, 'EmailIdentity', {
        identity: ses.Identity.publicHostedZone(zoneFor(cfg.emailDomain.name, cfg.emailDomain.zoneId)),
      });
    }

    if (cfg.waf.enabled) {
      this.firewall = new Firewall(this, 'Firewall', { name: prefix, mode: cfg.waf.mode, originSecret: this.api.originSecret, removalPolicy });
      this.firewall.associate('UserPoolAssociation', props.userPool.userPoolArn);
      this.firewall.associate('ApiAssociation', this.api.restApi.deploymentStage.stageArn);
    }

    new CfnOutput(this, 'TableName', { value: this.table.table.tableName });
    new CfnOutput(this, 'CoachTenantRoleArn', { value: this.tenants.coachTenant.roleArn });
    new CfnOutput(this, 'ClientTenantRoleArn', { value: this.tenants.clientTenant.roleArn });
    new CfnOutput(this, 'CodeLookupRoleArn', { value: this.tenants.codeLookup.roleArn });
    if (this.tenants.gateTest) new CfnOutput(this, 'GateTestRoleArn', { value: this.tenants.gateTest.roleArn });
    new CfnOutput(this, 'CoachSiteUrl', { value: `https://${cfg.sites.coach.host}/` });
    new CfnOutput(this, 'FamilySiteUrl', { value: `https://${cfg.sites.family.host}/` });
    new CfnOutput(this, 'CoachSiteBucket', { value: this.coachSite.bucket.bucketName });
    new CfnOutput(this, 'FamilySiteBucket', { value: this.familySite.bucket.bucketName });
  }
}

/**
 * CDK's own upload function (one per stack, behind both websites' `BucketDeployment`s), whose role CDK writes. Its
 * findings, with the reasons (ADR-032: every finding has a written reason).
 */
function acknowledgeSiteUpload(stack: Stack, buckets: s3.IBucket[]): void {
  const upload = stack.node.children.find((c) => c.node.id.startsWith('Custom::CDKBucketDeployment'));
  if (!upload) throw new Error('no site upload function: did BucketDeployment change?');
  const reason = 'CDK\'s BucketDeployment function, which copies the built website from CDK\'s asset bucket into the site '
    + 'bucket and clears CloudFront\'s copies (17c). Its role is written by CDK, limited to those two buckets and invalidations.';
  Validations.of(upload).acknowledge(
    { id: 'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]', reason },
    ...['s3:Abort*', 's3:DeleteObject*', 's3:GetBucket*', 's3:GetObject*', 's3:List*']
      .map((a) => ({ id: `AwsSolutions-IAM5[Action::${a}]`, reason })),
    { id: 'AwsSolutions-IAM5[Resource::*]', reason: `${reason} CloudFront invalidations can't be limited to a distribution.` },
    { id: `AwsSolutions-IAM5[Resource::arn:<AWS::Partition>:s3:::cdk-hnb659fds-assets-${stack.account}-${stack.region}/*]`, reason },
    ...buckets.map((b) => ({
      id: `AwsSolutions-IAM5[Resource::<${stack.getLogicalId(b.node.defaultChild as CfnElement)}.Arn>/*]`, reason,
    })),
    { id: 'AwsSolutions-L1', reason: 'CDK picks the upload function\'s runtime; it moves with aws-cdk-lib.' },
  );
}
