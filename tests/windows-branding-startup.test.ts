import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { WorkerSyncClient, CloudBaseAuthClient } from '../packages/sync/src/index';

describe('Windows Branding and Packaging Configuration', () => {
  it('electron-builder.yml defines correct KotoBud branding and executable stamping', () => {
    const yamlPath = path.resolve('electron-builder.yml');
    const content = fs.readFileSync(yamlPath, 'utf8');

    expect(content).toMatch(/^appId:\s*app\.kotobud\.desktop/m);
    expect(content).toMatch(/^productName:\s*KotoBud/m);
    expect(content).toMatch(/^copyright:\s*Copyright © 2026 KotoBud/m);
    expect(content).toMatch(/output:\s*release/);
    expect(content).toMatch(/-\s*preload\.cjs/);
    expect(content).toMatch(/-\s*icon\.ico/);

    // Executable stamping must not be disabled
    expect(content).not.toMatch(/signAndEditExecutable:\s*false/);

    // NSIS Configuration
    expect(content).toMatch(/shortcutName:\s*KotoBud/);
    expect(content).toMatch(/artifactName:\s*KotoBud-\$\{version\}-Windows-x64-Setup\.\$\{ext\}/);
    expect(content).toMatch(/installerIcon:\s*apps\/windows\/icon\.ico/);
    expect(content).toMatch(/uninstallerIcon:\s*apps\/windows\/icon\.ico/);

    // Portable Configuration
    expect(content).toMatch(/artifactName:\s*KotoBud-\$\{version\}-Windows-x64-Portable\.\$\{ext\}/);
    expect(content).toMatch(/unpackDirName:\s*KotoBud/);
  });

  it('apps/windows/package.json defines unified KotoBud identity', () => {
    const pkgPath = path.resolve('apps/windows/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    expect(pkg.name).toBe('kotobud-desktop');
    expect(pkg.productName).toBe('KotoBud');
  });

  it('apps/windows/main.cjs sets AppUserModelId, profiling, and shortcut IPC', () => {
    const mainPath = path.resolve('apps/windows/main.cjs');
    const code = fs.readFileSync(mainPath, 'utf8');

    expect(code).toContain("app.setAppUserModelId('app.kotobud.desktop')");
    expect(code).toContain('kotobud:create-desktop-shortcut');
    expect(code).toContain('kotobud:is-portable');
    expect(code).toContain('startupMetrics');
    expect(code).toContain('preload.cjs');
    expect(code).toContain('icon.ico');
  });

  it('apps/windows/preload.cjs exposes kotobudDesktop interface', () => {
    const preloadPath = path.resolve('apps/windows/preload.cjs');
    expect(fs.existsSync(preloadPath)).toBe(true);
    const code = fs.readFileSync(preloadPath, 'utf8');
    expect(code).toContain('kotobudDesktop');
    expect(code).toContain('isPortable');
    expect(code).toContain('createDesktopShortcut');
  });
});

describe('Startup Latency & Sync Timeout Robustness', () => {
  it('CloudBaseAuthClient.init() completes without network call when no token is cached (guest mode)', async () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as any;

    try {
      const client = new CloudBaseAuthClient('test-env', 'https://test.kotobud.com');
      await client.init();

      // No tokens in localStorage -> zero network calls
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(client.getCurrentUser()).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('WorkerSyncClient handles timeout with explicit message, eliminating "signal is aborted without reason"', async () => {
    const originalFetch = globalThis.fetch;
    // Simulate a hanging fetch
    globalThis.fetch = vi.fn((_url, options) => {
      return new Promise((_, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            reject(options.signal.reason || new Error('aborted'));
          });
        }
      });
    }) as any;

    try {
      const client = new WorkerSyncClient('https://test.kotobud.com', 50); // 50ms short timeout
      await expect(client.pull('fake-token')).rejects.toThrow(/网络同步请求超时/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
