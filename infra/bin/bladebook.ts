// The CDK app. `npx cdk deploy bladebook-dev-*` builds dev; production's stacks appear once
// its account ID is in lib/config.ts.

import { App } from 'aws-cdk-lib';
import { addEnvironment, addSecurityChecks } from '../lib/bladebook-app.ts';
import { environments } from '../lib/config.ts';

const app = new App();
for (const cfg of environments) {
  if (cfg.account) addEnvironment(app, cfg);
}
addSecurityChecks(app);
app.synth();
