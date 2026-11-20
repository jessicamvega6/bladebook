// ADR-028 decision 5: after the application stack is built, the table's import must match the file it was made from. An
// import skips a bad item with only a logged error, and keeps one of two items that share a key with no error at all, so
// the import's own counts are compared with the seed generator's: any difference, or any error, fails the build.
//
//   node seed/check-import.ts [--profile bladebook-dev] [--identity bladebook-dev-identity] [--app bladebook-dev-app]
//
// Exits 1 on a mismatch. The application stack must then be destroyed (`npx cdk destroy bladebook-dev-app`); the deploy
// workflow does that itself.

import { execFileSync } from 'node:child_process';
import { MANIFEST_KEY } from './manifest.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const profile = option('--profile', 'bladebook-dev');

function aws(...a: string[]): string {
  return execFileSync('aws', [...a, '--profile', profile, '--output', 'json'], { encoding: 'utf8' });
}

function outputs(stack: string): Record<string, string> {
  const s = JSON.parse(aws('cloudformation', 'describe-stacks', '--stack-name', stack)).Stacks[0];
  return Object.fromEntries((s.Outputs ?? []).map((o: { OutputKey: string; OutputValue: string }) => [o.OutputKey, o.OutputValue]));
}

const bucket = outputs(option('--identity', 'bladebook-dev-identity')).SeedBucketName;
const tableName = outputs(option('--app', 'bladebook-dev-app')).TableName;
if (!bucket || !tableName) throw new Error('the stacks have no SeedBucketName or TableName output');

const manifest = JSON.parse(aws('s3', 'cp', `s3://${bucket}/${MANIFEST_KEY}`, '-')) as { itemCount: number; sha256: string };
const tableArn = JSON.parse(aws('dynamodb', 'describe-table', '--table-name', tableName)).Table.TableArn as string;
const imports = JSON.parse(aws('dynamodb', 'list-imports', '--table-arn', tableArn)).ImportSummaryList as { ImportArn: string }[];
if (imports.length !== 1) throw new Error(`expected one import for ${tableName}, found ${imports.length}`);
const d = JSON.parse(aws('dynamodb', 'describe-import', '--import-arn', imports[0].ImportArn)).ImportTableDescription;

const problems: string[] = [];
if (d.ImportStatus !== 'COMPLETED') problems.push(`the import is ${d.ImportStatus}`);
if ((d.ErrorCount ?? 0) !== 0) problems.push(`${d.ErrorCount} items failed (see the import's CloudWatch log group)`);
if (d.ProcessedItemCount !== manifest.itemCount) problems.push(`${d.ProcessedItemCount} items read, the file has ${manifest.itemCount}`);
if (d.ImportedItemCount !== manifest.itemCount) problems.push(`${d.ImportedItemCount} items imported, the file has ${manifest.itemCount}`);

if (problems.length) {
  console.error(`import check failed for ${tableName}:\n  ${problems.join('\n  ')}`);
  console.error('Destroy the application stack before using dev (ADR-028 decision 5).');
  process.exit(1);
}
console.log(`import check: ${tableName} holds all ${manifest.itemCount} items of the seed file, no errors`);
