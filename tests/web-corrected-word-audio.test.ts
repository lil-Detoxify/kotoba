import { expect, it } from 'vitest';
import original from '../apps/web/src/google-audio-map.json';
import corrections from '../apps/web/src/textbook-corrections.json';
import { getGoogleAudioUrl } from '../apps/web/src/services/audioUrl';

it('uses corrected WaveNet clips when the original audio catalog lacks the corrected key', async () => {
  const keys = new Set(original.entries.map(row => `${row.term}|${row.reading}`));
  const missing = corrections.entries.filter(({corrected}) => !keys.has(`${corrected.term}|${corrected.reading}`));
  expect(missing.some(({corrected}) => corrected.term === 'ボウリング')).toBe(true);
  for (const {corrected: {term, reading}} of missing) {
    const female = await getGoogleAudioUrl(term, reading, 'female');
    const male = await getGoogleAudioUrl(term, reading, 'male');
    expect(female?.split('?')[0], term).toMatch(/\/assets\/word-pronunciation\/[^/]+\.mp3$/);
    expect(male?.split('?')[0], term).toMatch(/\/assets\/word-pronunciation\/[^/]+\.mp3$/);
    expect(male).not.toBe(female);
  }
});
