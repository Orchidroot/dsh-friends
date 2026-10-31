import { connectEvents } from './stream.mjs';
import Schema from '@deepseek-ai/schemastery';
import { randomUUID, createHash } from 'node:crypto';
import { createAgent, createUpstream, createRpcHandler, validateServiceUrl, RECORD_ID } from './host.mjs';

export const name = 'dsh-friends';
export const inject = ['connection', 'credentials'];
export const Config = Schema.object({
  serviceUrl: Schema.string().default('http://127.0.0.1:8787').description('Self-hosted friends service origin. HTTPS is required for anything other than loopback.'),
  autoAwayMinutes: Schema.natural().max(240).default(10).description('Report "away" after this many minutes without an active DSH window (0 disables).'),
});

/**
 * One record per exact service origin. Key segments must match /^[a-z][a-z0-9-]*$/, so the
 * origin is hashed: a readable slug would collide for http/https or IPv6 hosts.
 */
function recordId(origin) {
  return `${RECORD_ID}-${createHash('sha256').update(origin).digest('hex').slice(0, 16)}`;
}

/** Identity token lives only in the Host credential store (never in browser storage). */
function credentialStore(ctx, key) {
  return {
    async read() {
      const record = await ctx.credentials.readRecord(key);
      return record?.kind === 'grant' && record.payload && typeof record.payload === 'object' ? record.payload : undefined;
    },
    async write(value) {
      if (value === undefined) await ctx.credentials.deleteRecord(key);
      else await ctx.credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: value }));
    },
  };
}

export function apply(ctx, config = {}) {
  const serviceUrl = validateServiceUrl(config.serviceUrl);
  const key = `${name}/${recordId(serviceUrl)}`;
  const agent = createAgent({
    store: credentialStore(ctx, key),
    call: createUpstream(serviceUrl),
    connect: (options) => connectEvents({ ...options, origin:serviceUrl }),
    deviceId: `host-${randomUUID()}`,
    awayAfterMs: (config.autoAwayMinutes ?? 10) * 60_000,
  });
  ctx.effect(() => {
    agent.start().catch((error) => ctx.logger.warn(`dsh-friends: presence agent failed to start: ${String(error)}`));
    // Returning the promise lets Cordis await the logout on unload/shutdown.
    return () => agent.dispose().catch(() => {});
  }, 'dsh-friends: presence agent');
  // Another Host process (CLI, second window) may change or forget the shared identity record.
  ctx.on('credentials/record-updated', (changed) => {
    if (changed === key) agent.reload().catch((error) => ctx.logger.warn(`dsh-friends: identity reload failed: ${String(error)}`));
  });
  ctx.connection.fetch.register({ path: '/api/dsh-friends.rpc', methods: ['POST'], requestBody: 'buffered', fetch: createRpcHandler(agent, serviceUrl) });
}
