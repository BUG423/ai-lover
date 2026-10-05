import { extractFile, listPackage } from '@electron/asar';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowed =
  /^(?:main\.cjs|package\.json|renderer\/(?:index\.html|icon\.svg|icon-512\.png|assets\/[\w.-]+\.(?:js|css)))$/u;
const keyPattern = /\b(?:sk|tp|ttp)-[A-Za-z0-9_-]{20,}/u;

async function localSecrets() {
  const secrets = new Set();
  for (const [name, value] of Object.entries(process.env))
    if (/(?:api.?key|token|secret)/iu.test(name) && value && value.length >= 12) secrets.add(value);
  for (const name of await readdir(root)) {
    if (name === '.env.example' || !/^\.env(?:\.|$)/u.test(name)) continue;
    const content = await readFile(resolve(root, name), 'utf8');
    for (const line of content.split(/\r?\n/u)) {
      const match = /^\s*([\w]+)\s*=\s*(.*?)\s*$/u.exec(line);
      if (!match || !/(?:api.?key|token|secret)/iu.test(match[1])) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/u, '$2');
      if (value.length >= 12) secrets.add(value);
    }
  }
  return secrets;
}

function validate(name, contents, secrets) {
  if (!allowed.test(name))
    throw new Error(`Private or unexpected file in Windows payload: ${name}`);
  if (keyPattern.test(contents.toString('utf8')))
    throw new Error(`Credential-shaped value detected in Windows payload: ${name}`);
  for (const secret of secrets)
    if (contents.includes(Buffer.from(secret)))
      throw new Error(`Local secret detected in Windows payload: ${name}`);
}

export async function scanWindowsPayload(target) {
  const secrets = await localSecrets();
  let count = 0;
  if (target.endsWith('.asar')) {
    for (const path of listPackage(target)) {
      const name = path.replace(/^[/\\]/u, '').replaceAll('\\', '/');
      if (['renderer', 'renderer/assets'].includes(name)) continue;
      // ASAR resolves filenames using the host path separator. Keep the allowlist
      // portable, but pass native paths when reading the archive on Windows.
      validate(name, extractFile(target, name.split('/').join(sep)), secrets);
      count++;
    }
  } else {
    async function walk(directory) {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, item.name);
        if (item.isDirectory()) await walk(path);
        else if (item.isFile()) {
          validate(relative(target, path).replaceAll('\\', '/'), await readFile(path), secrets);
          count++;
        } else throw new Error('Symlinks and special files are forbidden in Windows payload');
      }
    }
    await walk(target);
  }
  console.log(`Windows payload verified: ${count} allowed files; no credential matches.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) throw new Error('Usage: node scripts/scan-windows.mjs <staging-directory|app.asar>');
  await scanWindowsPayload(resolve(target));
}
