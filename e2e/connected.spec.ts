import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

const adminKey = 'e2e-only-fictional-admin-key-24-characters';
const account = '/api/bank/accounts/acc-alice-checking';
async function admin(request: APIRequestContext) {
  expect((await request.post('/api/demo/session', { data: { handle: 'admin', adminKey } })).status()).toBe(201);
}
test.beforeEach(async ({ request }) => {
  await admin(request);
  expect((await request.post('/api/security/demo/reset', { data: {} })).status()).toBe(200);
  await request.post('/api/demo/logout', { data: { scope: 'admin' } });
});

test('banking, CSV, dashboard, advisory fallback, and independent logouts work through the frontend proxy', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in to banking', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Fictional grocery store' })).toBeVisible();
  await expect(page.getByText('$2,450.00', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/banking-connected.png', fullPage: true });
  const customer = await (await page.request.get('/api/demo/session')).json();
  expect(customer.user.handle).toBe('alice');
  expect((await page.request.get('/api/security/events')).status()).toBe(403);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('demo-transactions.csv');
  expect(readFileSync((await download.path())!, 'utf8')).toContain('Fictional grocery store');
  await page.getByRole('link', { name: 'Security Dashboard', exact: true }).first().click();
  await page.getByLabel('Demo admin key', { exact: true }).fill(adminKey);
  await page.getByRole('button', { name: 'Sign in as administrator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Live Activity', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'account.export', exact: true })).toBeVisible();
  await expect(page.getByLabel('Security session')).toHaveValue(customer.sessionId);
  await page.getByRole('button', { name: 'Analyze recent activity', exact: true }).click();
  await expect(page.getByText(/Rule-based fallback/)).toBeVisible();
  await expect(page.getByText('Fallback reason: not_configured')).toBeVisible();
  await page.screenshot({ path: 'test-results/security-connected.png', fullPage: true });
  expect((await (await page.request.get('/api/demo/session')).json()).sessionId).toBe(customer.sessionId);
  await page.getByRole('link', { name: 'Main Banking App', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Fictional grocery store' })).toBeVisible();
  await page.getByRole('button', { name: 'Alice · demo', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to banking', exact: true })).toBeVisible();
  expect((await page.request.get('/api/security/overview')).status()).toBe(200);
  await page.goto('/security');
  await page.getByRole('button', { name: 'Sign out administrator', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in as administrator', exact: true })).toBeVisible();
  expect((await page.request.get('/api/security/overview')).status()).toBe(401);
});

test('real throttles and blocks reach the bank UI; protection controls preserve ownership and reset risk', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in to banking', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Fictional grocery store' })).toBeVisible();
  const customer = await (await page.request.get('/api/demo/session')).json();
  await admin(page.request);
  await page.request.post('/api/security/demo/reset', { data: {} });
  for (let i = 0; i < 8; i++) expect((await page.request.get(account)).status()).toBe(200);
  await page.getByRole('button', { name: 'Refresh banking data', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Requests throttled by security rules' })).toBeVisible();
  for (let i = 0; i < 4; i++) expect((await page.request.get('/api/bank/accounts/acc-bob-checking')).status()).toBe(403);
  await page.getByRole('button', { name: 'Refresh banking data', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Requests blocked by security rules' })).toBeVisible();
  await page.goto('/security');
  await expect(page.getByLabel('Security session')).toHaveValue(customer.sessionId);
  await expect(page.getByLabel('Risk relative to the block threshold')).toHaveAttribute('value', '90');
  await expect(page.getByText(/unauthorized_resources combined to score 100/)).toBeVisible();
  await page.getByRole('button', { name: 'Turn protection off', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Turn protection on', exact: true })).toBeVisible();
  for (const suffix of ['', '/transactions', '/export']) expect((await page.request.get('/api/bank/accounts/acc-bob-checking' + suffix)).status()).toBe(403);
  expect((await page.request.get(account)).status()).toBe(200);
  await page.getByRole('button', { name: 'Reset demo activity', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Turn protection off', exact: true })).toBeVisible();
  await expect(page.getByText('No banking events recorded. Use the banking page to generate activity.')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('cell', { name: 'Fictional grocery store' })).toBeVisible();
  expect((await (await page.request.get('/api/demo/session')).json()).sessionId).toBe(customer.sessionId);
});

test('security events paginate without exposing logs to signed-out customers', async ({ page }) => {
  expect((await page.request.get('/api/security/events')).status()).toBe(401);
  // Bounded local fixture automation only: no Nessie/model calls.
  for (let i = 0; i < 25; i++) expect((await page.request.get(account)).status()).toBe(401);
  await admin(page.request);
  await page.goto('/security');
  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(21);
  await page.getByRole('button', { name: 'Older events', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Older events', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Latest events', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(21);
});
