import { afterEach, describe, expect, it } from 'vitest';
import { startGateway } from '../../apps/windows/gateway';

describe('Windows loopback gateway', () => {
  let gateway: Awaited<ReturnType<typeof startGateway>> | undefined;
  afterEach(() => gateway?.close());

  it('blocks ordinary localhost requests and accepts only the main-process capability', async () => {
    gateway = await startGateway('/does-not-exist');
    expect(gateway.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    const denied = await fetch(`${gateway.url}/api/health`);
    expect(denied.status).toBe(403);
    const wrong = await fetch(`${gateway.url}/api/health`, {
      headers: { 'x-ai-lover-capability': 'a'.repeat(64) },
    });
    expect(wrong.status).toBe(403);
    const allowed = await fetch(`${gateway.url}/api/health`, {
      headers: { 'x-ai-lover-capability': gateway.token },
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ ok: true });
    expect(allowed.headers.get('cache-control')).toBe('no-store');
  });

  it('uses a different unpredictable capability for every process', async () => {
    gateway = await startGateway('/does-not-exist');
    const other = await startGateway('/does-not-exist');
    try {
      expect(gateway.token).toMatch(/^[a-f0-9]{64}$/u);
      expect(gateway.token).not.toBe(other.token);
      const response = await fetch(`${other.url}/api/health`, {
        headers: { 'x-ai-lover-capability': gateway.token },
      });
      expect(response.status).toBe(403);
    } finally {
      other.close();
    }
  });
});
