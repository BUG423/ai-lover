import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'ai-lover-desktop-smoke-'));
let application;
async function launch() {
  application = await electron.launch({
    args: [resolve(root, 'desktop-build')],
    env: { ...process.env, AI_LOVER_SMOKE_PROFILE: profile },
    timeout: 30_000,
  });
  const window = await application.firstWindow();
  await window.waitForSelector('#root button');
  assert.equal(window.url(), 'ai-lover://app/');
  return window;
}

try {
  let window = await launch();
  assert.equal(await window.evaluate(() => window.isSecureContext), true);
  assert.equal(await window.evaluate(() => typeof globalThis.require), 'undefined');
  const health = await window.evaluate(async () => (await fetch('/api/health')).json());
  assert.deepEqual(health, { ok: true });
  const outside = await window.evaluate(async () => {
    try {
      await fetch('https://example.com');
      return 'allowed';
    } catch {
      return 'blocked';
    }
  });
  assert.equal(outside, 'blocked');
  const initial = await window.evaluate(() => localStorage.getItem('zhixin.data.v1'));
  assert.ok(initial && JSON.parse(initial).companions.length > 0);
  // Real localStorage and IndexedDB continuity over a fresh Electron process.
  await window.evaluate(async () => {
    localStorage.setItem('desktop-smoke', 'persistent');
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('desktop-smoke', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('values');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('values', 'readwrite');
        tx.objectStore('values').put('persistent', 'test');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });
  });
  await application.close();
  application = undefined;
  window = await launch();
  assert.equal(await window.evaluate(() => localStorage.getItem('desktop-smoke')), 'persistent');
  assert.equal(await window.evaluate(() => localStorage.getItem('zhixin.data.v1')), initial);
  const indexedValue = await window.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('desktop-smoke', 1);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('values').objectStore('values').get('test');
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = reject;
        };
        request.onerror = reject;
      }),
  );
  assert.equal(indexedValue, 'persistent');
  console.log(
    'Desktop smoke passed: startup, API, secure origin, isolation, network blocking, restart persistence.',
  );
} finally {
  await application?.close();
  await rm(profile, { recursive: true, force: true });
}
