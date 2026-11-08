import type { Config } from './config.ts';
import type { Signal } from './database.ts';
import type { RuleHit, RuleId } from './contracts.ts';

export interface Rule {
  id: RuleId;
  evaluate(signals: Signal[], now: number, config: Config): RuleHit | undefined;
}
/** Pure TypeScript rules. Scores indicate configured behavior signals, never AI identity. */
export const rules: Rule[] = [
  {
    id: 'request_frequency',
    evaluate(signals, now, c) {
      const count = signals.filter(s => s.at > now - c.burstWindowMs).length;
      return count > c.burstLimit ? { id: this.id, count, score: 0, reason: `More than ${c.burstLimit} requests in ${c.burstWindowMs}ms` } : undefined;
    },
  },
  {
    id: 'unauthorized_resources',
    evaluate(signals, _now, c) {
      const count = signals.filter(s => s.authorization === 'denied').length;
      return count ? { id: this.id, count, score: count * c.unauthorizedWeight, reason: `${count} unauthorized resource attempts in the risk window` } : undefined;
    },
  },
  {
    id: 'repeated_exports',
    evaluate(signals, _now, c) {
      const count = signals.filter(s => s.action === 'account.export').length;
      return count > 1 ? { id: this.id, count, score: (count - 1) * c.exportWeight, reason: `${count} export attempts in the risk window; first export has no score` } : undefined;
    },
  },
  {
    id: 'decoy_access',
    evaluate(signals, _now, c) {
      const count = signals.filter(s => s.action === 'decoy.export').length;
      return count ? { id: this.id, count, score: count * c.decoyWeight, reason: `${count} decoy export attempts in the risk window` } : undefined;
    },
  },
];
