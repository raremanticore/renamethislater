import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAnalystSmoke } from '../scripts/analyst-smoke.ts';
import { loadConfig } from '../src/config.ts';

const config = () => loadConfig({ DEMO_MODE: 'true', DEMO_ADMIN_KEY: 'fake-admin-key-at-least-24-characters',
  OPENAI_API_KEY: 'fake-openai-key', OPENAI_EXPLANATION_MODEL: 'gpt-6-luna', BANKING_PROVIDER: 'nessie',
  NESSIE_API_KEY: 'fake-nessie-key', NESSIE_ACCOUNT_MAP: '{"user-alice":{"acc-alice-checking":"sandbox-id"}}' });

test('analyst smoke uses one mocked model request, real local admin/session routes, and no Nessie data', async () => {
  const output = await runAnalystSmoke(config(), async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const raw = String(options?.body); const body = JSON.parse(raw);
    assert.deepEqual(body.reasoning, { effort: 'none' }); assert.equal(body.store, false);
    const events = JSON.parse(body.input).untrustedEvents;
    assert.equal(events.length, 5);
    for (const privateValue of ['fake-openai-key', 'fake-nessie-key', 'fake-admin-key', 'accountId', 'balanceCents']) assert.ok(!raw.includes(privateValue));
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
      assessment: 'suspicious', explanation: 'Repeated denied collection attempts warrant review.', supportingRequestIds: [events[0].requestId],
    }) }] }] });
  });
  assert.equal(output.modelRequests, 1); assert.equal(output.localRequests, 8);
  assert.equal(output.result.analysis.source, 'model'); assert.equal(output.result.enforcement.currentDecision, 'block');
  assert.equal(output.result.enforcement.currentRiskScore, 100);
});
test('analyst smoke exposes only provider status and labeled fallback on rejected credentials', async () => {
  const output = await runAnalystSmoke(config(), async () => new Response('secret upstream error', { status: 401 }));
  assert.equal(output.providerStatus, 401); assert.equal(output.result.analysis.source, 'deterministic');
  assert.ok(!JSON.stringify(output).includes('secret upstream error'));
});
test('analyst smoke fails before model access when configuration is missing', async () => {
  let called = false;
  await assert.rejects(runAnalystSmoke(loadConfig({}), async () => { called = true; return Response.json({}); }), /Configure/);
  assert.equal(called, false);
});
