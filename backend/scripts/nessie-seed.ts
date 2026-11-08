import { closeSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { nessieSeedPlan, seedAccountId, seedNessie, SeedFailure } from '../src/nessie-seed.ts';

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const rest = args.filter(arg => arg !== '--live');
  if (rest.length !== 4 || rest[0] !== '--user' || rest[2] !== '--account' || args.filter(arg => arg === '--live').length > 1)
    throw new Error('Usage: npm run nessie:seed -- --user alice --account acc-alice-checking [--live]');
  const handle = rest[1]!; const alias = rest[3]!;
  const config = loadConfig(); seedAccountId(config, handle, alias);
  const plan = nessieSeedPlan();
  console.log(`${live ? 'LIVE SANDBOX SEED' : 'PREVIEW ONLY'}: 6 fictional deposits and 24 fictional withdrawals over the past month.`);
  console.log('Deposits: USD 4000 total. Withdrawals: USD 2310 total. Existing demo-v1 markers will be skipped. No existing records are deleted.');
  if (!live) {
    console.log('No network calls or changes made. Add --live to create these records in the mapped own-sandbox account.');
    return;
  }
  if (plan.length !== 30) throw new Error('Unexpected seed plan size');
  mkdirSync(resolve('data'), { recursive: true });
  const lock = resolve('data/nessie-seed.lock');
  let handleLock: number;
  try { handleLock = openSync(lock, 'wx'); }
  catch { throw new Error('Another seed may be running. If a previous seed crashed, remove data/nessie-seed.lock only after confirming it stopped'); }
  try {
    const result = await seedNessie(config, handle, alias, { live: true });
    console.log(`Seed complete: ${result.created} created, ${result.skipped} already present, ${result.providerRequests} provider requests. No payloads or credentials printed.`);
  } finally { closeSync(handleLock); unlinkSync(lock); }
}
main().catch(error => {
  if (error instanceof SeedFailure) console.error(`Seed stopped: ${error.created} writes acknowledged, ${error.skipped} records skipped. ${error.message}`);
  else console.error(error instanceof Error && !/https?:|key=|Bearer/.test(error.message) ? error.message : 'Seed failed; no provider body, URL, or credentials printed');
  process.exitCode = 1;
});
