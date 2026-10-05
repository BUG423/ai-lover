import { build } from 'esbuild';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDesktopPayload } from './scan-desktop.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const stage = resolve(root, 'desktop-build');
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await rm(stage, { recursive: true, force: true });
await mkdir(resolve(stage, 'web/assets'), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['desktop/main.ts'],
  outfile: resolve(stage, 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: false,
  minify: true,
});
const staticFiles = [
  'index.html',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'manifest.webmanifest',
];
for (const name of staticFiles)
  await copyFile(resolve(root, 'dist', name), resolve(stage, 'web', name));
for (const name of await readdir(resolve(root, 'dist/assets'))) {
  if (!/^[\w.-]+\.(?:js|css)$/u.test(name)) throw new Error(`Unexpected build asset: ${name}`);
  await copyFile(resolve(root, 'dist/assets', name), resolve(stage, 'web/assets', name));
}
await writeFile(
  resolve(stage, 'package.json'),
  JSON.stringify(
    {
      name: metadata.name,
      version: metadata.version,
      description: 'Private conversations with your AI companion',
      author: 'AI Lover contributors',
      private: true,
      main: 'main.cjs',
      dependencies: {},
    },
    null,
    2,
  ) + '\n',
);
await scanDesktopPayload(stage);
console.log(`Desktop runtime prepared: desktop-build (${metadata.version})`);
