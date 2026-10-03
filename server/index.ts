import { createApp } from './app';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
    throw error;
}

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT 必须是 1–65535 之间的整数');
const server = createApp().listen(port, '0.0.0.0', () => {
  console.info(`AI Lover server listening on http://0.0.0.0:${port}`);
});
for (const event of ['SIGINT', 'SIGTERM'] as const) {
  process.once(event, () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
  });
}
