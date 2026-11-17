// The application stack: built after the account stack, destroyed when dev's work is done
// (ADR-027, ADR-028). Batch 17a holds the websites, the data buckets and access log, SES and
// the firewall. Batch 17b adds the table (built from the seed import), the API, the functions,
// the event backbone and the scheduled jobs.

import { CfnOutput, Stack } from 'aws-cdk-lib';
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
import { BladebookTable } from './table.ts';
import { Website } from './website.ts';

export interface AppStackProps extends StackProps {
  readonly cfg: EnvConfig;
  readonly userPool: cognito.IUserPool;
  /** Dev: the account stack's seed bucket, which the table is imported from (ADR-028). */
  readonly seedBucket?: s3.IBucket;
}

export class AppStack extends Stack {
  readonly coachSite: Website;
  readonly familySite: Website;
  readonly data: DataBuckets;
  readonly firewall?: Firewall;
  readonly table: BladebookTable;

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

    this.coachSite = new Website(this, 'CoachSite', {
      site: cfg.sites.coach,
      zone: zoneFor(cfg.sites.coach.zoneName, cfg.sites.coach.zoneId),
      noindex: cfg.noindex,
      removalPolicy,
    });
    this.familySite = new Website(this, 'FamilySite', {
      site: cfg.sites.family,
      zone: zoneFor(cfg.sites.family.zoneName, cfg.sites.family.zoneId),
      noindex: cfg.noindex,
      removalPolicy,
    });

    this.data = new DataBuckets(this, 'Data', { prefix, removalPolicy });

    if (cfg.seedImport && !props.seedBucket) throw new Error(`${id}: seedImport needs the account stack's seed bucket`);
    this.table = new BladebookTable(this, 'Table', {
      tableName: prefix,
      removalPolicy,
      ...(cfg.seedImport ? { seedBucket: props.seedBucket } : {}),
    });

    if (cfg.emailDomain) {
      // DKIM records go in the zone; the identity starts in the SES sandbox.
      new ses.EmailIdentity(this, 'EmailIdentity', {
        identity: ses.Identity.publicHostedZone(zoneFor(cfg.emailDomain.name, cfg.emailDomain.zoneId)),
      });
    }

    if (cfg.waf.enabled) {
      this.firewall = new Firewall(this, 'Firewall', { name: prefix, mode: cfg.waf.mode, removalPolicy });
      this.firewall.associate('UserPoolAssociation', props.userPool.userPoolArn);
      // The REST API's stage is associated in Batch 17b.
    }

    new CfnOutput(this, 'TableName', { value: this.table.table.tableName });
    new CfnOutput(this, 'CoachSiteUrl', { value: `https://${cfg.sites.coach.host}/` });
    new CfnOutput(this, 'FamilySiteUrl', { value: `https://${cfg.sites.family.host}/` });
    new CfnOutput(this, 'CoachSiteBucket', { value: this.coachSite.bucket.bucketName });
    new CfnOutput(this, 'FamilySiteBucket', { value: this.familySite.bucket.bucketName });
  }
}
