import type { Account, Transaction } from './contracts.ts';
import type { StateStore } from './storage.ts';

/** Ownership must use trusted server state without fetching protected upstream data. */
export interface BankingRepository {
  readonly source?: 'local' | 'nessie';
  accountIds?(userId: string): string[] | Promise<string[]>;
  ownsAccount(userId: string, accountId: string): boolean | Promise<boolean>;
  account(id: string): Account | Promise<Account>;
  transactions(id: string): Transaction[] | Promise<Transaction[]>;
}
export class LocalBankingRepository implements BankingRepository {
  readonly source = 'local';
  store: StateStore;
  constructor(store: StateStore) { this.store = store; }
  accountIds(userId: string) {
    return this.store.accountIds(userId);
  }
  ownsAccount(userId: string, accountId: string) {
    return this.store.ownsAccount(userId, accountId);
  }
  account(id: string) {
    return this.store.account(id);
  }
  transactions(id: string) {
    return this.store.transactions(id);
  }
}
export function csv(rows: Transaction[]): string {
  const cell = (value: string | number) => {
    let text = String(value);
    // Prevent spreadsheet formula injection for textual fields. Amounts remain numeric.
    if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return 'id,accountId,postedAt,description,amountCents\r\n' + rows.map(row =>
    [row.id, row.accountId, row.postedAt, row.description, row.amountCents].map(cell).join(',')
  ).join('\r\n') + '\r\n';
}
