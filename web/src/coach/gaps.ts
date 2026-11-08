/**
 * Batch 1's gaps and shortcuts for the coach website. Kept in step with README.md and the plan's
 * section 7. IDs: A* are ruled ADR/screen conflicts (plan section 4), SC-* shortcuts, G-* gaps.
 */
import type { Gap } from '../shared/components/GapsPanel';

export const COACH_GAPS: Gap[] = [
  { id: 'SC-1', kind: 'shortcut', what: 'Signing in is a local token stub, not Amazon Cognito. It issues tokens with the Coach group and the coach app client, and the real checks run against them.', closedBy: 'the Cognito user pool existing' },
  { id: 'SC-2', kind: 'shortcut', what: '“I’ve clicked the link” marks a different business email confirmed at once. No email or link is sent.', closedBy: 'batch 14 (business-email confirmation)' },
  { id: 'SC-3', kind: 'shortcut', what: 'Data lives in DynamoDB Local with one unscoped client. The coach-tenant role and its database gate aren’t exercised.', closedBy: 'infrastructure code and the gate tests on real AWS' },
  { id: 'SC-4', kind: 'shortcut', what: 'Nothing is deployed: the API and website run only on this computer.', closedBy: 'choosing the infrastructure tool, AWS account and domain (Blockers 2, 22)' },
  { id: 'A1', kind: 'gap', what: 'No profile photo upload; families see initials (ruled: Phase 2).', closedBy: 'Phase 2' },
  { id: 'A3', kind: 'gap', what: 'No texts switch at sign-up (ruled: profile only). The profile switch is on Visibility & texts, not built yet.', closedBy: 'the Visibility & texts tab (G-3)' },
  { id: 'G-1', kind: 'gap', what: '“Resend link” and “Change address” for a business email waiting to be confirmed.', closedBy: 'batch 14' },
  { id: 'G-2', kind: 'gap', what: 'Profile → Business email (the list of addresses).', closedBy: 'batch 14' },
  { id: 'G-3', kind: 'gap', what: 'Profile → Visibility & texts (show phone or email to families; text me on late cancellations).', closedBy: 'a later batch, not yet placed in the plan' },
  { id: 'G-4', kind: 'gap', what: 'Profile → Account (change password, log out through Cognito).', closedBy: 'the Cognito user pool existing' },
  { id: 'G-5', kind: 'gap', what: 'Sign-up steps 1 and 2 (create the account, verify the login email): Cognito owns them.', closedBy: 'the Cognito user pool existing' },
  { id: 'G-6', kind: 'gap', what: 'Today, Calendar, Schedule, Students, Lessons and Payments pages, and “Build your teaching week”.', closedBy: 'batches 2 to 8' },
  { id: 'G-7', kind: 'gap', what: 'No warning before the 60-minute sign-in runs out; the next request asks you to sign in again.', closedBy: 'a later batch, not yet placed in the plan' },
];
