import type { Account, Transaction } from './contracts.ts';
import type { Store } from './database.ts';

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
  store: Store;
  constructor(store: Store) { this.store = store; }
  accountIds(userId: string): string[] {
    return this.store.db.prepare('SELECT id FROM accounts WHERE user_id=? ORDER BY id').all(userId).map(row => String(row.id));
  }
  ownsAccount(userId: string, accountId: string) {
    return !!this.store.db.prepare('SELECT 1 FROM accounts WHERE id=? AND user_id=?').get(accountId, userId);
  }
  account(id: string): Account {
    return this.store.db.prepare('SELECT id,name,currency,balance_cents AS balanceCents FROM accounts WHERE id=?').get(id) as unknown as Account;
  }
  transactions(id: string): Transaction[] {
    return this.store.db.prepare('SELECT id,account_id AS accountId,posted_at AS postedAt,description,amount_cents AS amountCents FROM transactions WHERE account_id=? ORDER BY posted_at,id').all(id) as unknown as Transaction[];
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
