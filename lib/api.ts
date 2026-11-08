import type { ErrorResponse } from '@/backend/src/contracts';

export class ApiError extends Error {
  status: number;
  code: string;
  retryAfter: number | null;
  constructor(status: number, code: string, message: string, retryAfter: number | null) {
    super(message); this.status = status; this.code = code; this.retryAfter = retryAfter;
  }
}
async function response(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let result: Response;
  try { result = await fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' }); }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'connection_failed', 'Could not reach the backend. Check that both servers are running.', null);
  }
  if (!result.ok) {
    const data = await result.json().catch(() => null) as ErrorResponse | null;
    const rawRetry = Number(result.headers.get('Retry-After'));
    throw new ApiError(result.status, data?.error?.code ?? 'api_unavailable', data?.error?.message ?? 'The backend could not complete this request.',
      Number.isFinite(rawRetry) && rawRetry > 0 ? rawRetry : null);
  }
  return result;
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await response(path, init)).json() as Promise<T>;
}
export const post = <T,>(path: string, data: object, signal?: AbortSignal) => api<T>(path, { method: 'POST', body: JSON.stringify(data), signal });
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'security_throttled') return `Requests throttled by security rules. Wait ${error.retryAfter ?? 'a few'} seconds before retrying.`;
    if (error.code === 'security_blocked') return 'Requests blocked by security rules. Stop requests and wait for risk to expire, or ask the demo administrator to reset activity.';
    if (error.code.startsWith('nessie_')) return `Nessie sandbox: ${error.message} (${error.code})`;
    return error.message;
  }
  return 'Unable to complete this request. Please try again.';
}
export const money = (cents: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
export const timestamp = (iso: string) => new Date(iso).toLocaleString();
export async function downloadCsv(accountId: string): Promise<void> {
  const result = await response(`/api/bank/accounts/${encodeURIComponent(accountId)}/export`);
  const url = URL.createObjectURL(await result.blob());
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'demo-transactions.csv';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
