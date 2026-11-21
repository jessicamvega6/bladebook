// SES (ADR-MASTER §13): every email template, and the environment's sending addresses. The templates are built from
// design/harbor/email/templates.mjs into design/harbor/email/ses/<name>.json; each becomes one SES template of the same
// name, which the code names in each email (core's Email record).
//
// Which function may send which template is on its role. `api-coach` may send only the business-email confirmation
// (ADR-MASTER §2, I9: `sendOnly`); the consumers and scheduled jobs get theirs with their functions.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Stack, Validations } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ses from 'aws-cdk-lib/aws-ses';
import { Construct } from 'constructs';

const templatesDir = join(dirname(fileURLToPath(import.meta.url)), '../../design/harbor/email/ses');

interface TemplateFile {
  readonly TemplateName: string;
  readonly TemplateContent: { readonly Subject: string; readonly Html: string; readonly Text: string };
}

/** Every built template, by name. */
export function templateFiles(): TemplateFile[] {
  return readdirSync(templatesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const t = JSON.parse(readFileSync(join(templatesDir, f), 'utf8')) as TemplateFile;
      if (`${t.TemplateName}.json` !== f) throw new Error(`${f} holds the template ${t.TemplateName}`);
      return t;
    });
}

export interface EmailProps {
  /** The verified domain the sending addresses are on. */
  readonly domain: string;
}

export class Email extends Construct {
  /** `lessons@<domain>`: every email's From (ADR-MASTER §13). */
  readonly from: string;
  /** `no-reply@<domain>`: the Reply-To of emails to the coach. */
  readonly noReply: string;
  private readonly templates = new Map<string, ses.CfnTemplate>();

  constructor(scope: Construct, id: string, props: EmailProps) {
    super(scope, id);
    this.from = `lessons@${props.domain}`;
    this.noReply = `no-reply@${props.domain}`;
    for (const t of templateFiles()) {
      this.templates.set(t.TemplateName, new ses.CfnTemplate(this, t.TemplateName, {
        template: {
          templateName: t.TemplateName,
          subjectPart: t.TemplateContent.Subject,
          htmlPart: t.TemplateContent.Html,
          textPart: t.TemplateContent.Text,
        },
      }));
    }
  }

  /**
   * Lets `role` send these templates and no others, from the sending address only. SES checks a templated send against
   * the template's ARN and against every identity it involves: the sender's and, while the account is in the SES
   * sandbox (dev, always), the recipient's too, so the identity part is any identity, held to the From address.
   */
  sendOnly(role: iam.IRole, templates: string[]): void {
    const { partition, region, account } = Stack.of(this);
    for (const name of templates) {
      if (!this.templates.has(name)) throw new Error(`no SES template named ${name}`);
    }
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'SendItsTemplatesOnly',
      // SES checks SendEmail with a template as ses:SendTemplatedEmail (found deploying to dev, 2026-11-17), so the role
      // can send nothing but templates.
      actions: ['ses:SendTemplatedEmail'],
      resources: [
        `arn:${partition}:ses:${region}:${account}:identity/*`,
        ...templates.map((name) => `arn:${partition}:ses:${region}:${account}:template/${name}`),
      ],
      conditions: { StringEquals: { 'ses:FromAddress': this.from } },
    }));
    Validations.of(role).acknowledge({
      id: `AwsSolutions-IAM5[Resource::arn:<AWS::Partition>:ses:${region}:${account}:identity/*]`,
      reason: 'SES checks the recipient\'s identity too while in the sandbox; the From address is held by ses:FromAddress, '
        + 'and the templates are named one by one.',
    });
  }
}
