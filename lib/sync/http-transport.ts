import type { RoadSegmentContribution } from '@/lib/domain/sync';
import type { DeviceId } from '@/lib/domain/schema';
import type { PullPage, PushItem, PushResult, SyncTransport } from './transport';

/**
 * REST transport.
 *
 * Untested against a live server because none exists yet — but the engine it
 * plugs into is fully tested via `MemoryTransport`, so this file is the only
 * unverified surface, and it is deliberately thin.
 *
 * The API it expects:
 *
 *   POST {baseUrl}/sync/push        { deviceId, items } → PushResult
 *   GET  {baseUrl}/sync/pull?cursor=&deviceId=          → PullPage
 *   POST {baseUrl}/community/contribute { cells }       → 202
 *   GET  {baseUrl}/health                               → 200
 *
 * Push must be idempotent on each item's key, because a response lost in
 * transit is retried and the client cannot tell "never arrived" from
 * "arrived, reply dropped".
 */
export interface HttpTransportOptions {
  baseUrl: string;
  /** Called per request, so a rotated token is picked up without reconstruction. */
  getAuthToken?: () => string | null | Promise<string | null>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class HttpTransport implements SyncTransport {
  readonly id = 'http';
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpTransportOptions) {
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const doFetch = this.options.fetchImpl ?? fetch;
    const token = await this.options.getAuthToken?.();

    // Without a timeout a stalled connection would hang the sync run forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await doFetch(`${this.options.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`${init.method ?? 'GET'} ${path} failed: ${response.status}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async push(items: PushItem[], deviceId: DeviceId): Promise<PushResult> {
    return this.request<PushResult>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ deviceId, items }),
    });
  }

  async pull(cursor: string | null, deviceId: DeviceId): Promise<PullPage> {
    const params = new URLSearchParams({ deviceId });
    if (cursor) params.set('cursor', cursor);
    return this.request<PullPage>(`/sync/pull?${params.toString()}`);
  }

  async contribute(cells: RoadSegmentContribution[]): Promise<void> {
    if (cells.length === 0) return;
    // Deliberately swallowed: a failed anonymous contribution must never break
    // a user's sync or surface as an error they can act on.
    try {
      await this.request('/community/contribute', {
        method: 'POST',
        body: JSON.stringify({ cells }),
      });
    } catch {
      // ignore
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.request('/health');
      return true;
    } catch {
      return false;
    }
  }
}
