import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

describe('production startup', () => {
  it('reports an occupied port and exits with failure instead of claiming to listen', async () => {
    const occupied = createServer();
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    const port = (occupied.address() as { port: number }).port;
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    try {
      const [code] = await once(child, 'exit');
      expect(code).toBe(1);
      expect(stderr).toContain(`端口 ${port} 已被占用`);
      expect(stdout).not.toContain('listening');
    } finally {
      clearTimeout(timeout);
      child.kill();
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
  }, 10000);
});
