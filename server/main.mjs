import { resolve } from 'node:path';
import { createFriendsService } from './service.mjs';

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
function limit(key, fallback) {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${key} must be a positive integer`);
  return value;
}
const service = createFriendsService({
  registerLimitHour: limit('REGISTER_LIMIT_HOUR', 100),
  ipLimitMinute: limit('IP_LIMIT_MINUTE', 10000),
  identityLimitMinute: limit('IDENTITY_LIMIT_MINUTE', 300),
  database: resolve(process.env.DATA_DIR ?? 'data', 'friends.sqlite'),
  publicOrigin: process.env.PUBLIC_ORIGIN,
  frameAncestors: process.env.FRAME_ANCESTORS,
  signupCode: process.env.SIGNUP_CODE,
  onError(error) { console.error('Friends service error:', error.code ?? error.name); },
});
service.server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`DSH Friends listening on ${process.env.HOST ?? '127.0.0.1'}:${port}`);
});
service.server.on('error', (error) => { console.error('Listen failed:', error.code); process.exitCode = 1; service.close(); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await service.close();
  process.exit(0);
});
