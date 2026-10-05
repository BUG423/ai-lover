import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const directory = resolve(process.argv[2] || 'artifacts');
const files = (await readdir(directory)).filter((name) => /\.(?:apk|exe|zip)$/u.test(name)).sort();
if (!files.length) throw new Error('No distribution files to hash');
const entries = [];
for (const name of files) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(resolve(directory, name))) hash.update(chunk);
  entries.push(`${hash.digest('hex')}  ${basename(name)}`);
}
await writeFile(resolve(directory, 'SHA256SUMS.txt'), entries.join('\n') + '\n');
console.log(`SHA256SUMS.txt written for ${files.length} distribution files.`);
