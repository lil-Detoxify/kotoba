import { describe, it, expect } from 'vitest';

const STAGING_URL = 'https://staging.kotoba-iuz.pages.dev';

describe('Staging Live Multi-Client E2E Verification (D1 Remote DB)', { timeout: 20000 }, () => {
  const testRunId = Date.now();
  const userId = `live_e2e_${testRunId}`;
  const token = `test_${userId}:${userId}:${userId}@kotobud.com`;
  const wordId = `test_word_${testRunId}`;

  it('Device 1: checks capabilities and status on live staging worker', async () => {
    const capRes = await fetch(`${STAGING_URL}/api/v1/capabilities`);
    expect(capRes.status).toBe(200);
    const cap = await capRes.json() as any;
    expect(cap.capabilities).toContain('d1_sync');
    expect(cap.storage).toBe('cloudflare_d1');

    const statusRes = await fetch(`${STAGING_URL}/api/v1/sync/status`);
    expect(statusRes.status).toBe(200);
    const status = await statusRes.json() as any;
    expect(status.d1_bound).toBe(true);
  });

  it('Device 1: bootstraps user and verifies initial cloud data state', async () => {
    const bootRes = await fetch(`${STAGING_URL}/api/v1/sync/bootstrap`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    expect(bootRes.status).toBe(200);
    const boot = await bootRes.json() as any;
    expect(boot.userId).toMatch(/^kb_/);
  });

  it('Device 1: pushes initial review event and progress to remote D1', async () => {
    const now = new Date().toISOString();
    const pushRes = await fetch(`${STAGING_URL}/api/v1/sync/push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        events: [
          {
            _id: `ev_${testRunId}_1`,
            wordId,
            reviewedAt: now,
            rating: 3,
            responseTime: 1200,
            studyMode: 'new'
          }
        ],
        progress: [
          {
            wordId,
            status: 'learning',
            reviewCount: 1,
            lapseCount: 0,
            card: { reps: 1, state: 1, due: now, stability: 2.5, difficulty: 5.0 },
            isDifficult: false,
            isIgnored: false,
            updatedAt: now
          }
        ],
        settings: {
          currentBookId: 'biaori-beginner-upper',
          preferences: {
            pronunciationVoice: 'female'
          }
        }
      })
    });
    expect(pushRes.status).toBe(200);
    const pushData = await pushRes.json() as any;
    expect(pushData.success).toBe(true);
    expect(pushData.acceptedEvents).toBe(1);
    expect(pushData.updatedProgress).toBe(1);
  });

  it('Device 2: pulls from remote D1 and receives Device 1 progress and settings', async () => {
    const pullRes = await fetch(`${STAGING_URL}/api/v1/sync/pull`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    expect(pullRes.status).toBe(200);
    const pull = await pullRes.json() as any;
    expect(pull.progress.some((p: any) => p.wordId === wordId)).toBe(true);
    expect(pull.events.some((e: any) => e._id === `ev_${testRunId}_1`)).toBe(true);
    expect(pull.settings?.currentBookId).toBe('biaori-beginner-upper');
    expect(pull.settings?.preferences?.pronunciationVoice).toBe('female');
  });

  it('Device 2: marks word as difficult (star) and pushes to remote D1', async () => {
    const markTime = new Date().toISOString();
    const pushRes = await fetch(`${STAGING_URL}/api/v1/sync/push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        progress: [
          {
            wordId,
            isDifficult: true,
            difficultUpdatedAt: markTime,
            updatedAt: markTime
          }
        ]
      })
    });
    expect(pushRes.status).toBe(200);
  });

  it('Device 1: pulls again and confirms LWW field merge reflected difficult = true', async () => {
    const pullRes = await fetch(`${STAGING_URL}/api/v1/sync/pull`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    expect(pullRes.status).toBe(200);
    const pull = await pullRes.json() as any;
    const updated = pull.progress.find((p: any) => p.wordId === wordId);
    expect(updated).toBeDefined();
    expect(updated.isDifficult).toBe(true);
  });

  it('Device 1: cancels difficulty at later timestamp (LWW false overrides true)', async () => {
    // 50ms later
    await new Promise(r => setTimeout(r, 50));
    const unmarkTime = new Date().toISOString();
    const pushRes = await fetch(`${STAGING_URL}/api/v1/sync/push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        progress: [
          {
            wordId,
            isDifficult: false,
            difficultUpdatedAt: unmarkTime,
            updatedAt: unmarkTime
          }
        ]
      })
    });
    expect(pushRes.status).toBe(200);

    // Device 2 pulls and confirms unmark is synchronized
    const pullRes = await fetch(`${STAGING_URL}/api/v1/sync/pull`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const pull = await pullRes.json() as any;
    const finalWord = pull.progress.find((p: any) => p.wordId === wordId);
    expect(finalWord.isDifficult).toBe(false);
  });
});
