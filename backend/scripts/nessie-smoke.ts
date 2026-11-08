/** Explicit one-account, read-only own-sandbox check. Never part of npm test/demo. */
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApplication } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { Store } from '../src/database.ts';
import { smokeFailure } from '../src/smoke-errors.ts';

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => args[args.indexOf(name) + 1];
  const handle = option('--user'); const alias = option('--account');
  if (args.length !== 5 || !args.includes('--live') || !args.includes('--user') || !args.includes('--account')
    || (handle !== 'alice' && handle !== 'bob') || !alias || alias.startsWith('--'))
    throw new Error('Explicit opt-in required: npm run nessie:smoke -- --live --user alice --account acc-alice-checking');
  const config = loadConfig();
  if (!config.demoMode || config.bankingProvider !== 'nessie') throw new Error('Set DEMO_MODE=true and BANKING_PROVIDER=nessie before this live check');
  const base = new URL(config.nessieBaseUrl);
  if (!['https://prod-api.nessieisreal.com', 'https://qa-api.nessieisreal.com'].includes(base.origin) || base.pathname !== '/')
    throw new Error('The live smoke command permits only official Nessie sandbox origins without a path prefix');
  if (!config.nessieAccounts[`user-${handle}`] || !Object.hasOwn(config.nessieAccounts[`user-${handle}`]!, alias))
    throw new Error('The selected account alias must belong to this user in the trusted server mapping');
  const deadline = AbortSignal.timeout(15_000);
  let upstreamReads = 0;
  const store = new Store(':memory:');
  const app = createApplication(config, { store, nessieFetch: async (url, options) => {
    if (++upstreamReads > 3) throw new Error('Live smoke read budget exceeded');
    return fetch(url, { ...options, signal: AbortSignal.any([deadline, options?.signal ?? deadline]) });
  } });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const local = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  console.log('Explicit live own-sandbox smoke: one account, deposit feed, withdrawal feed; at most 3 upstream GETs / 15 seconds. No model calls or writes.');
  async function request(stage: 'login' | 'account' | 'transactions', path: string, cookie = '', data?: object) {
    const response = await fetch(local + path, { method: data ? 'POST' : 'GET', redirect: 'error', signal: deadline,
      headers: { Cookie: cookie, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined });
    if (!response.ok) throw await smokeFailure(response, stage);
    return response;
  }
  try {
    const login = await request('login', '/api/demo/session', '', { handle });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!; await login.arrayBuffer();
    const account = await request('account', `/api/bank/accounts/${encodeURIComponent(alias)}`, cookie);
    if (account.headers.get('x-banking-source') !== 'nessie') throw new Error('Unexpected banking source');
    const payload = await account.json() as { account: { balanceCents: number } };
    if (!Number.isSafeInteger(payload.account.balanceCents)) throw new Error('Unexpected account amount format');
    const response = await request('transactions', `/api/bank/accounts/${encodeURIComponent(alias)}/transactions`, cookie);
    const feed = await response.json() as { transactions: { amountCents: number }[] };
    if (!feed.transactions.every(tx => Number.isSafeInteger(tx.amountCents))) throw new Error('Unexpected transaction amount format');
    console.log(`Live sandbox reads passed: 1 account, ${feed.transactions.length} deposit/withdrawal records, ${upstreamReads} upstream GETs. Payloads and credentials were not printed.`);
  } finally {
    app.server.closeAllConnections(); await new Promise<void>(resolve => app.server.close(() => resolve())); store.close();
  }
}
main().catch(error => {
  // Known application messages contain no secrets; never print fetch errors/stacks/URLs.
  const message = error instanceof Error && !/https?:|key=|Bearer/.test(error.message) ? error.message : 'Live smoke failed; check configuration/connectivity without logging credentials';
  console.error(message); process.exitCode = 1;
});
