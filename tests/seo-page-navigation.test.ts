import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
// @ts-ignore The production page generator is a JavaScript module.
import { generateAllSeoPages } from '../scripts/generate-seo-pages.mjs';

let outputDir: string;

beforeAll(() => {
  outputDir = mkdtempSync(join(tmpdir(), 'kotobud-seo-navigation-'));
  generateAllSeoPages(outputDir);
});

afterAll(() => rmSync(outputDir, { recursive: true, force: true }));

function navigate(file: string, pathname: string, hash: string, userAgent = 'Mozilla/5.0', protocol = 'https:') {
  const html = readFileSync(join(outputDir, file), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const destinations: string[] = [];
  const context = {
    window: { location: { pathname, hash, protocol, replace: (url: string) => destinations.push(url) } },
    navigator: { userAgent },
    localStorage: { getItem: () => null },
    document: { getElementById: () => null },
  };
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) runInNewContext(script[1], context);
  return destinations;
}

describe('Generated public page navigation', () => {
  it.each([
    ['guide.html', '/guide', '#fsrs'],
    ['guide/index.html', '/guide/', '#sync'],
    ['download.html', '/download', '#portable'],
    ['about.html', '/about', '#brand'],
    ['about/index.html', '/about/', '#license'],
    ['index.html', '/', '#features'],
  ])('keeps the public anchor %s %s%s on its page', (file, path, hash) => {
    expect(navigate(file, path, hash)).toEqual([]);
  });

  it.each(['#/', '#/books', '#/books/biaori-1?lesson=2', '#/study?mode=review', '#/import', '#/difficult', '#/ignored', '#/stats', '#/settings'])('preserves the legacy home bookmark %s', (hash) => {
    expect(navigate('index.html', '/', hash)).toEqual(['/app/' + hash]);
  });

  it('supports the legacy index.html homepage', () => {
    expect(navigate('index.html', '/index.html', '#/books')).toEqual(['/app/#/books']);
  });

  it.each(['', '#', '#/unknown', '#/books/id/extra', '#/study-extra', '#books'])('does not redirect unrelated home fragments %s', (hash) => {
    expect(navigate('index.html', '/', hash)).toEqual([]);
  });

  it('does not treat a public content page as an old application entry', () => {
    expect(navigate('guide.html', '/guide', '#/study')).toEqual([]);
  });

  it('keeps the Electron application entry working', () => {
    expect(navigate('index.html', '/', '', 'Electron')).toEqual(['/app.html']);
    expect(navigate('index.html', '/', '', 'Mozilla/5.0', 'kotoba:')).toEqual(['/app.html']);
  });
});
