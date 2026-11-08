import type { Config } from './config.ts';
import type { StateStore } from './storage.ts';
import type { Action, Authorization, Decision, EnforcementBasis, ProtectionStatus, RuleHit, SecurityEvent } from './contracts.ts';
import { rules } from './rules.ts';

export interface Assessment { riskScore: number; triggeredRules: RuleHit[]; decision: Decision; retryAfter: number; reasons: string[] }
export class SecurityEngine {
  store: StateStore; config: Config;
  constructor(store: StateStore, config: Config) { this.store = store; this.config = config; }
  async status(): Promise<ProtectionStatus> {
    const c = this.config;
    return { enabled: await this.store.protection(), windowMs: c.windowMs, burstWindowMs: c.burstWindowMs,
      burstLimit: c.burstLimit, throttleScore: c.throttleScore, blockScore: c.blockScore, scoreMeaning: 'internal_rule_score' };
  }
  async assess(sessionId: string, now: number): Promise<Assessment> {
    const c = this.config;
    if (!await this.store.protection()) return { riskScore: 0, triggeredRules: [], decision: 'allow', retryAfter: 0, reasons: ['Behavioral protection is disabled'] };
    const signals = await this.store.signals(sessionId, now - c.windowMs);
    const triggeredRules = rules.flatMap(rule => rule.evaluate(signals, now, c) ?? []);
    const riskScore = triggeredRules.reduce((sum, hit) => sum + hit.score, 0);
    const burst = triggeredRules.some(rule => rule.id === 'request_frequency');
    const decision = riskScore >= c.blockScore ? 'block' : riskScore >= c.throttleScore || burst ? 'throttle' : 'allow';
    // Conservatively wait until all score-bearing signals expire; burst-only waits for the burst window.
    const retryAfter = decision === 'throttle'
      ? Math.max(1, Math.ceil(((signals.at(-1)?.at ?? now) + (riskScore >= c.throttleScore ? c.windowMs : c.burstWindowMs) - now) / 1000)) : 0;
    return { riskScore, triggeredRules, decision, retryAfter,
      reasons: triggeredRules.length ? triggeredRules.map(hit => hit.reason) : ['No behavioral rule triggered'] };
  }
  async inspect(input: { requestId: string; sessionId: string | null; action: Action; targetResource: string; authorization: Authorization }, now: number): Promise<Assessment> {
    // State, assessment, and audit record are atomic across requests/processes sharing this database.
    return this.store.atomic(async store => {
      await store.prune(now, this.config.windowMs, this.config.eventRetentionMs);
      const enabled = await store.protection();
      if (input.sessionId && enabled) await store.addSignal(input.sessionId, { at: now, action: input.action, authorization: input.authorization });
      const result: Assessment = input.sessionId ? await new SecurityEngine(store, this.config).assess(input.sessionId, now)
        : { riskScore: 0, triggeredRules: [], decision: 'allow', retryAfter: 0, reasons: [] };
      if (input.authorization !== 'allowed') {
        result.decision = 'deny';
        result.reasons = [input.authorization === 'unauthenticated' ? 'A valid server session is required' : 'Account ownership denied', ...result.reasons];
      }
      const scoreDriven = result.decision === 'block' || (result.decision === 'throttle' && result.riskScore >= this.config.throttleScore);
      const enforcement: EnforcementBasis = {
        cause: result.decision === 'deny' ? 'authorization' : !enabled ? 'protection_disabled'
          : scoreDriven ? 'score_threshold' : result.decision === 'throttle' ? 'request_frequency' : 'none',
        threshold: result.decision === 'block' ? this.config.blockScore : scoreDriven ? this.config.throttleScore : null,
        contributingRuleIds: scoreDriven ? result.triggeredRules.filter(rule => rule.score > 0).map(rule => rule.id)
          : result.decision === 'throttle' ? ['request_frequency'] : [],
      };
      const event: SecurityEvent = { ...input, timestamp: new Date(now).toISOString(),
        decision: result.decision, riskScore: result.riskScore, triggeredRules: result.triggeredRules,
        reasons: result.reasons, protectionEnabled: enabled, enforcement };
      await store.record(event);
      return result;
    });
  }
}
