/** Dashboard API v1. Add fields compatibly; never reinterpret existing fields. */
export type Decision = 'allow' | 'deny' | 'throttle' | 'block';
export type Authorization = 'allowed' | 'denied' | 'unauthenticated';
export type Action = 'account.read' | 'transactions.read' | 'account.export' | 'decoy.export';
export type RuleId = 'request_frequency' | 'unauthorized_resources' | 'repeated_exports' | 'decoy_access';
export interface RuleHit { id: RuleId; count: number; score: number; reason: string }
export interface EnforcementBasis {
  cause: 'authorization' | 'score_threshold' | 'request_frequency' | 'none' | 'protection_disabled';
  threshold: number | null; contributingRuleIds: RuleId[];
}
export interface SecurityEvent {
  requestId: string;
  sessionId: string | null;
  timestamp: string;
  action: Action;
  /** Canonical route plus SHA-256 target fingerprint; never the raw URL or payload. */
  targetResource: string;
  authorization: Authorization;
  decision: Decision;
  triggeredRules: RuleHit[];
  riskScore: number;
  reasons: string[];
  protectionEnabled: boolean;
  /** Added in v1; historical events may lack the recorded enforcement basis. */
  enforcement?: EnforcementBasis;
}
export interface ProtectionStatus {
  enabled: boolean;
  windowMs: number;
  burstWindowMs: number;
  burstLimit: number;
  throttleScore: number;
  blockScore: number;
  scoreMeaning: 'internal_rule_score';
}
export interface Counts { total: number; allow: number; deny: number; throttle: number; block: number }
export interface TimeBucket extends Counts { start: string; end: string }
export interface SessionSummary {
  sessionId: string; firstSeen: string; lastSeen: string;
  riskScore: number; triggeredRules: RuleHit[]; decision: Decision; eventCount: number;
}
export interface OverviewResponse {
  apiVersion: '1'; generatedAt: string; protection: ProtectionStatus;
  period: { start: string; end: string; bucketMs: number };
  totals: Counts; buckets: TimeBucket[]; sessions: SessionSummary[];
}
export interface EventsResponse {
  apiVersion: '1'; items: SecurityEvent[];
  pagination: { limit: number; nextCursor: string | null; hasMore: boolean };
}
export interface Explanation { source: 'deterministic' | 'model'; text: string }
export type AnalystAssessment = 'normal' | 'suspicious' | 'uncertain';
export interface AnalystResult {
  source: 'deterministic' | 'model'; assessment: AnalystAssessment; explanation: string;
  /** Server-generated request IDs identify the existing events used as evidence. */
  supportingRequestIds: string[];
  advisoryOnly: true;
  fallbackReason?: 'not_configured' | 'no_events' | 'provider_failed' | 'invalid_response' | 'busy';
}
export interface AnalysisResponse {
  apiVersion: '1'; sessionId: string; generatedAt: string;
  sample: { eventCount: number; maxEvents: number; windowMs: number; firstEventAt: string | null; lastEventAt: string | null };
  analysis: AnalystResult;
  /** Recorded enforcement facts, supplied by the server, never inferred by the model. */
  enforcement: {
    currentDecision: Decision; currentRiskScore: number; protection: ProtectionStatus;
    blockedRequests: { requestId: string; triggeredRules: RuleHit[]; reasons: string[]; riskScore: number; basis: EnforcementBasis | null }[];
  };
}
export interface SessionResponse {
  apiVersion: '1'; session: SessionSummary; protection: ProtectionStatus;
  timeline: SecurityEvent[];
  timelinePagination: { limit: number; nextCursor: string | null; hasMore: boolean };
  explanation: Explanation;
}
export interface ProtectionResponse { apiVersion: '1'; protection: ProtectionStatus }
export interface ResetResponse extends ProtectionResponse { resetAt: string }
export interface ErrorResponse { error: { code: string; message: string; requestId: string } }
export interface DemoSessionResponse {
  developmentOnly: true; sessionId: string; expiresAt: string;
  user: { handle: string; role: 'customer' | 'admin' };
  accountIds: string[];
  bankingSource?: 'local' | 'nessie';
}
export interface Account { id: string; name: string; currency: string; balanceCents: number }
export interface Transaction {
  id: string; accountId: string; postedAt: string; description: string; amountCents: number;
}
