import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './gateway/app';

/** Only the Windows main process knows this capability; no browser or LAN access. */
export async function startGateway(staticDir: string) {
  const token = randomBytes(32).toString('hex');
  const expected = Buffer.from(token);
  const application = createApp({ staticDir });
  const server = createServer((request, response) => {
    const supplied = request.headers['x-ai-lover-capability'];
    const actual = typeof supplied === 'string' ? Buffer.from(supplied) : Buffer.alloc(0);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      response.writeHead(403, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      response.end('Forbidden');
      return;
    }
    application(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    token,
    close() {
      server.close();
      server.closeAllConnections();
    },
  };
}
