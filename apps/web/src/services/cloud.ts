import {LocalOnlySyncClient, type SyncClient, type SyncIdentity} from '@jp/sync';

/**
 * The web app is local-only until account sync is deliberately enabled.
 * Keeping construction here makes a future API v1 transport replaceable without
 * adding login controls or uploading IndexedDB data implicitly.
 */
export function createSyncClient(): SyncClient {
  return new LocalOnlySyncClient();
}

export function localIdentity(): SyncIdentity {
  return {kind: 'local', userId: 'local'};
}
