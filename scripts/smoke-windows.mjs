import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'ai-lover-windows-smoke-'));
const packagedExecutable = process.argv[2] ? resolve(process.argv[2]) : undefined;
let application;
async function launch() {
  application = await electron.launch({
    ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
    args: packagedExecutable ? [] : [resolve(root, '.build/windows')],
    env: {
      ...process.env,
      AI_LOVER_SMOKE_PROFILE: profile,
      APPDATA: profile,
      XDG_CONFIG_HOME: profile,
    },
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
  await window.locator('.main-nav').getByRole('button', { name: '设置', exact: true }).click();
  await window.getByLabel('API 密钥', { exact: true }).fill('tp-desktop-smoke');
  await window.getByRole('button', { name: '保存设置', exact: true }).click();
  await window.getByText('设置已保存，API Key 已在本机加密存储', { exact: true }).waitFor();
  const storedSettings = await window.evaluate(() => localStorage.getItem('zhixin.settings.v1'));
  assert.ok(storedSettings && JSON.parse(storedSettings).secret?.ciphertext);
  assert.equal(storedSettings.includes('tp-desktop-smoke'), false);
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
  await window.locator('.main-nav').getByRole('button', { name: '设置', exact: true }).click();
  assert.equal(
    await window.getByLabel('API 密钥', { exact: true }).inputValue(),
    'tp-desktop-smoke',
  );
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
    'Windows smoke passed: startup, API, secure origin, isolation, network blocking, restart persistence, encrypted-key restore.',
  );
} finally {
  await application?.close();
  await rm(profile, { recursive: true, force: true });
}
