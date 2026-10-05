import { build } from 'esbuild';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanWindowsPayload } from './scan-windows.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const stage = resolve(root, '.build/windows');
const renderer = resolve(root, '.build/ui');
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await rm(stage, { recursive: true, force: true });
await mkdir(resolve(stage, 'renderer/assets'), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['apps/windows/main.ts'],
  outfile: resolve(stage, 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: false,
  minify: true,
});
const staticFiles = ['index.html', 'icon.svg', 'icon-512.png'];
for (const name of staticFiles)
  await copyFile(resolve(renderer, name), resolve(stage, 'renderer', name));
for (const name of await readdir(resolve(renderer, 'assets'))) {
  if (!/^[\w.-]+\.(?:js|css)$/u.test(name)) throw new Error(`Unexpected build asset: ${name}`);
  await copyFile(resolve(renderer, 'assets', name), resolve(stage, 'renderer/assets', name));
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
await scanWindowsPayload(stage);
console.log(`Windows runtime prepared: .build/windows (${metadata.version})`);
