import { describe, expect, it } from 'vitest';
import { showWindowsDownload } from '../apps/web/src/services/clientPlatform';

describe('Web Windows download visibility', () => {
  it('shows on desktop Web, including a narrow desktop window', () => {
    expect(showWindowsDownload('https:', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(true);
    expect(showWindowsDownload('https:', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true);
  });

  it('hides on iOS, iPadOS and Android regardless of viewport width', () => {
    expect(showWindowsDownload('https:', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false);
    expect(showWindowsDownload('https:', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe(false);
    expect(showWindowsDownload('https:', 'Mozilla/5.0 (Linux; Android 15; Pixel 8)')).toBe(false);
    expect(showWindowsDownload('https:', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 5)).toBe(false);
  });

  it('hides inside the Windows app', () => {
    expect(showWindowsDownload('kotoba:', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
  });
});
