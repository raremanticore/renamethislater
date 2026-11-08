import type { BankingRepository } from './banking.ts';
import type { Account, Transaction } from './contracts.ts';
import type { Config, NessieAccountMap } from './config.ts';
import { boundedJson } from './http-json.ts';

/** Deliberately holds no upstream URL, body, key, or original exception/cause. */
export class NessieError extends Error {
  status: number; code: string; retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message); this.name = 'NessieError'; this.status = status; this.code = code; this.retryAfter = retryAfter;
  }
}
const invalid = () => new NessieError(502, 'nessie_invalid_response', 'Nessie returned an unsupported or inconsistent sandbox response');
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid();
  return value;
}
/** Application policy: Nessie USD major units -> exact integer cents, never float rounding. */
export function cents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw invalid();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw invalid();
  const result = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
  return Number(result);
}
function postedAt(value: unknown): string {
  const text = string(value, 32);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(text)) throw invalid();
  const time = Date.parse(text);
  if (!Number.isFinite(time)) throw invalid();
  const iso = new Date(time).toISOString();
  if (iso.slice(0, 10) !== text.slice(0, 10)) throw invalid();
  return iso;
}
export class NessieBankingRepository implements BankingRepository {
  readonly source = 'nessie';
  #apiKey: string; #baseUrl: string; #mapping: NessieAccountMap; #send: typeof fetch;
  constructor(config: Config, send: typeof fetch = fetch) {
    if (!config.nessieApiKey || !Object.values(config.nessieAccounts).some(accounts => Object.keys(accounts).length))
      throw new Error('Nessie requires a key and trusted account mapping');
    this.#apiKey = config.nessieApiKey; this.#baseUrl = config.nessieBaseUrl;
    this.#mapping = structuredClone(config.nessieAccounts); this.#send = send;
  }
  accountIds(userId: string): string[] {
    return Object.keys(Object.hasOwn(this.#mapping, userId) ? this.#mapping[userId]! : {}).sort();
  }
  ownsAccount(userId: string, alias: string): boolean {
    return Object.hasOwn(this.#mapping, userId) && Object.hasOwn(this.#mapping[userId]!, alias);
  }
  #upstreamId(alias: string): string {
    for (const accounts of Object.values(this.#mapping)) if (Object.hasOwn(accounts, alias)) return accounts[alias]!;
    throw new NessieError(403, 'account_access_denied', 'Account access denied');
  }
  async #read(path: string, signal: AbortSignal): Promise<unknown> {
    // Nessie's official spec requires the key query parameter. Never log/serialize this URL.
    const url = new URL(this.#baseUrl + path);
    url.searchParams.set('key', this.#apiKey);
    let response: Response;
    try {
      response = await this.#send(url, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal });
    } catch {
      throw new NessieError(signal.aborted ? 504 : 502, signal.aborted ? 'nessie_timeout' : 'nessie_unavailable',
        signal.aborted ? 'Nessie timed out; no banking data was returned' : 'Nessie could not be reached; no local fallback was used');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 401 || response.status === 403) throw new NessieError(502, 'nessie_auth_failed', 'Nessie rejected server credentials; check the sandbox key and permissions');
      if (response.status === 404) throw new NessieError(502, 'nessie_account_not_found', 'The configured Nessie sandbox resource was not found; check the server mapping');
      if (response.status === 429) throw new NessieError(503, 'nessie_rate_limited', 'Nessie rate limited this read; retry later', 5);
      throw new NessieError(502, 'nessie_upstream_error', 'Nessie failed this read; no local fallback was used');
    }
    try { return await boundedJson(response, 2 * 1024 * 1024); }
    catch {
      if (signal.aborted) throw new NessieError(504, 'nessie_timeout', 'Nessie timed out; no banking data was returned');
      throw invalid();
    }
  }
  async account(alias: string): Promise<Account> {
    const id = this.#upstreamId(alias);
    const raw = record(await this.#read(`/accounts/${encodeURIComponent(id)}`, AbortSignal.timeout(5000)));
    if (raw._id !== id) throw invalid();
    return { id: alias, name: string(raw.nickname), currency: 'USD', balanceCents: cents(raw.balance) };
  }
  async transactions(alias: string): Promise<Transaction[]> {
    const id = this.#upstreamId(alias);
    const signal = AbortSignal.timeout(5000); // One deadline for the complete two-read operation.
    const rows: Transaction[] = [];
    const seen = new Set<string>();
    for (const kind of ['deposit', 'withdrawal'] as const) {
      const raw = await this.#read(`/accounts/${encodeURIComponent(id)}/${kind}s`, signal);
      if (!Array.isArray(raw) || raw.length > 1000) throw invalid(); // Reject, never silently truncate.
      for (const item of raw) {
        const tx = record(item);
        const txId = string(tx._id, 128);
        if (!/^[a-zA-Z0-9_-]+$/.test(txId) || (tx.account_id !== undefined && tx.account_id !== id)) throw invalid();
        const key = `nessie-${kind}-${txId}`;
        if (seen.has(key)) throw invalid();
        seen.add(key);
        const amount = cents(tx.amount);
        const status = string(tx.status, 60);
        rows.push({ id: key, accountId: alias, postedAt: postedAt(tx.transaction_date),
          description: `Nessie ${kind} (${status}): ${string(tx.description)}`,
          amountCents: kind === 'deposit' ? amount : -amount });
      }
    }
    return rows.sort((a, b) => a.postedAt.localeCompare(b.postedAt) || a.id.localeCompare(b.id));
  }
}
