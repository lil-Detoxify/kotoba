import {describe, expect, it, vi} from 'vitest';
import {decodeSyncRequest, encodeSyncRequest, HttpSyncClient, LocalOnlySyncClient, parseSyncResponse, type SyncRequest} from '@jp/sync';

const request: SyncRequest = {
  apiVersion: 'v1', identity: {kind: 'local', userId: 'local'}, cursor: {version: 3},
  changes: {clientId: 'desktop-a', idempotencyKey: 'op-1', baseCursor: {version: 3}, records: [
    {id: 'state-1', wordId: 'book:lesson:1', userId: 'local', revision: 2, updatedAt: '2026-09-16T01:02:03.000Z', payload: {reviewCount: 2}}
  ]}
};

describe('sync boundary', () => {
  it('keeps local-only mode explicit and never reports success', async () => {
    const client = new LocalOnlySyncClient();
    expect(client.status()).toEqual({status: 'disabled', reason: 'local_only'});
    expect(await client.sync(request)).toEqual({status: 'disabled', reason: 'local_only'});
  });
  it('round-trips ISO timestamps as JSON strings', () => {
    expect(decodeSyncRequest(encodeSyncRequest(request))).toEqual(request);
  });
  it('supports runtime credentials, cancellation and timeout', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true})));
    const client = new HttpSyncClient({endpoint: 'https://sync.invalid/v1/sync', identity: {kind: 'account', userId: 'u1'}, getAccessToken: () => 'runtime-token', fetchImpl, defaultTimeoutMs: 5});
    await expect(client.sync({...request, identity: {kind: 'account', userId: 'u1'}})).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledWith('https://sync.invalid/v1/sync', expect.objectContaining({method: 'POST', headers: expect.objectContaining({authorization: 'Bearer runtime-token'}), signal: expect.any(AbortSignal)}));
  });
  it('rejects malformed records and an already-cancelled request before fetch', async () => {
    expect(() => decodeSyncRequest(JSON.stringify({...request, cursor: {version: '3'}}))).toThrow('invalid sync request');
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new HttpSyncClient({endpoint: 'https://sync.invalid/v1/sync', identity: {kind: 'local', userId: 'local'}, fetchImpl});
    const controller = new AbortController(); controller.abort();
    await expect(client.sync(request, {signal: controller.signal})).rejects.toMatchObject({name: 'AbortError'});
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(() => decodeSyncRequest(JSON.stringify({...request, changes: {...request.changes!, records: [{id: 'x'}]}}))).toThrow('invalid sync request');
  });
  it('validates response conflicts and JSON payloads at the transport boundary', () => {
    const response = {apiVersion: 'v1', cursor: {version: 4}, changes: request.changes!.records,
      acceptedIdempotencyKeys: ['op-1'], conflicts: [{recordId: 'state-1', reason: 'stale_update', server: request.changes!.records[0]}]};
    expect(parseSyncResponse(response)).toEqual(response);
    expect(() => parseSyncResponse({...response, conflicts: [{recordId: 'state-1', reason: 'unknown'}]})).toThrow('invalid sync response');
    expect(() => parseSyncResponse({...response, changes: [{...response.changes[0], payload: {bad: undefined}}]})).toThrow('invalid sync response');
  });
  it('rejects a request identity that does not match the configured client', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new HttpSyncClient({endpoint: 'https://sync.invalid/v1/sync', identity: {kind: 'local', userId: 'local'}, fetchImpl});
    await expect(client.sync({...request, identity: {kind: 'account', userId: 'u1'}})).rejects.toThrow('sync identity does not match client identity');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
