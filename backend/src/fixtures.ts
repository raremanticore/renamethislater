/** Fictional fixtures only. No external bank integration or real customer data. */
export const users = [
  { id: 'user-alice', handle: 'alice', role: 'customer' },
  { id: 'user-bob', handle: 'bob', role: 'customer' },
  { id: 'user-admin', handle: 'admin', role: 'admin' },
] as const;
export const accounts = [
  { id: 'acc-alice-checking', userId: 'user-alice', name: 'Demo checking', balanceCents: 245000 },
  { id: 'acc-alice-savings', userId: 'user-alice', name: 'Demo savings', balanceCents: 810000 },
  { id: 'acc-bob-checking', userId: 'user-bob', name: 'Demo checking', balanceCents: 167500 },
];
export const transactions = accounts.flatMap(account => [
  { id: `${account.id}-tx-1`, accountId: account.id, postedAt: '2026-10-01T12:00:00.000Z', description: 'Fictional employer deposit', amountCents: 125000 },
  { id: `${account.id}-tx-2`, accountId: account.id, postedAt: '2026-10-02T12:00:00.000Z', description: 'Fictional grocery store', amountCents: -6450 },
  { id: `${account.id}-tx-3`, accountId: account.id, postedAt: '2026-10-03T12:00:00.000Z', description: 'Fictional cafe', amountCents: -575 },
]);
