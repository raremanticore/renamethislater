import { boundedJson } from './http-json.ts';

const hints: Record<string, string> = {
  nessie_auth_failed: 'Nessie rejected the API key or permissions. Check NESSIE_API_KEY in .env.',
  nessie_account_not_found: 'Check the mapped bank account _id: it must exist under this API key, not be a customer ID, and use the correct Nessie environment.',
  nessie_rate_limited: 'Nessie rate limited this read. Wait before trying again.',
  nessie_timeout: 'Nessie did not finish within the five-second operation deadline.',
  nessie_unavailable: 'The server could not reach Nessie. Check network, TLS/proxy settings, and NESSIE_API_BASE_URL.',
  nessie_upstream_error: 'Nessie returned an unsuccessful upstream status. Check provider availability before retrying.',
  nessie_invalid_response: 'Nessie replied, but the account/feed did not match the supported format or limits. Verify the mapped bank account ID and USD amount format.',
  account_access_denied: 'This alias is not owned by the selected demo user in the trusted server mapping.',
  authentication_required: 'The local demo session was missing or expired.',
  security_blocked: 'Local behavioral rules blocked this read.',
  security_throttled: 'Local behavioral rules throttled this read.',
};

/** Never echo provider messages, URLs, payloads, or unknown error codes into CLI output. */
export async function smokeFailure(response: Response, stage: 'login' | 'account' | 'transactions'): Promise<Error> {
  let code = 'unrecognized_error';
  try {
    const data = await boundedJson(response, 4096) as { error?: { code?: unknown } } | null;
    const candidate = data?.error?.code;
    if (typeof candidate === 'string' && Object.hasOwn(hints, candidate)) code = candidate;
  } catch { /* Non-JSON/oversized errors must not leak their bodies. */ }
  const hint = hints[code] ?? 'The local protected route failed without a recognized diagnostic code. No response body was printed.';
  return new Error(`Live smoke ${stage} failed: HTTP ${response.status} [${code}]. ${hint}`);
}
