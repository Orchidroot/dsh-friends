import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'server', 'cli.mjs');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const timeout = 10_000;

async function within(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

function environment(overrides = {}) {
  const env = { ...process.env };
  // Never inherit a real database, signup policy, preload hook or coverage destination.
  const isolated = /^(HOST|PORT|DATA_DIR|PUBLIC_ORIGIN|FRAME_ANCESTORS|SIGNUP_CODE|REGISTER_LIMIT_HOUR|IP_LIMIT_MINUTE|IDENTITY_LIMIT_MINUTE|NODE_OPTIONS|NODE_V8_COVERAGE)$/i;
  for (const key of Object.keys(env)) if (isolated.test(key)) delete env[key];
  return { ...env, ...overrides };
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-friends-npm-'));
  const processes = [];
  t.after(async () => {
    try {
      for (const child of processes) {
        if (!child.result) child.process.kill('SIGKILL');
        await within(child.closed, 5_000, `child did not close during cleanup: ${child.output()}`);
      }
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
  function launch(args, overrides, graceful = false) {
    // Windows kill(SIGTERM) forcibly terminates a process. Dispatch the same Node
    // signal event over IPC there so the actual CLI's shutdown handler is tested.
    const ipcShutdown = process.platform === 'win32' && graceful;
    const preload = 'data:text/javascript,' + encodeURIComponent(
      "process.on('message', message => { if (message === 'test:SIGTERM') process.emit('SIGTERM'); });",
    );
    const child = spawn(process.execPath, [...(ipcShutdown ? ['--import', preload] : []), cli, ...args], {
      cwd: directory,
      env: environment(overrides),
      stdio: ['ignore', 'pipe', 'pipe', ...(ipcShutdown ? ['ipc'] : [])],
      windowsHide: true,
    });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const run = { process: child, result: null, output: () => `${stdout}\n${stderr}` };
    let spawnError;
    child.once('error', (error) => { spawnError = error; });
    run.closed = new Promise((done) => child.once('close', (code, signal) => {
      run.result = { code, signal, stdout, stderr, error: spawnError };
      done(run.result);
    }));
    run.stop = () => {
      if (ipcShutdown) child.send('test:SIGTERM', () => {});
      else child.kill('SIGTERM');
    };
    processes.push(run);
    return run;
  }
  return { directory, launch };
}

async function listen(port = 0) {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  return server;
}

async function closeListener(server) {
  await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
}

async function freePort() {
  const server = await listen();
  const port = server.address().port;
  await closeListener(server);
  return port;
}

async function assertPortAvailable(port) {
  const server = await listen(port);
  await closeListener(server);
}

async function absent(path) {
  await assert.rejects(stat(path), { code: 'ENOENT' });
}

async function quickExit(t, args, expectedCode) {
  const f = await fixture(t);
  const port = await freePort();
  const child = f.launch(args, {
    HOST: '127.0.0.1', PORT: String(port), DATA_DIR: join(f.directory, 'env data'),
    PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
  });
  const result = await within(child.closed, timeout, `CLI did not exit: ${args.join(' ')}\n${child.output()}`);
  assert.ifError(result.error);
  assert.equal(result.signal, null, child.output());
  if (expectedCode === 0) assert.equal(result.code, 0, child.output());
  else assert.ok(Number.isInteger(result.code) && result.code !== 0, child.output());
  assert.deepEqual(await readdir(f.directory), [], 'informational/invalid arguments must not create any data');
  await assertPortAvailable(port);
  return result;
}

async function healthy(child, origin) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    assert.equal(child.result, null, `service exited before becoming healthy: ${child.output()}`);
    try {
      const response = await fetch(origin + '/healthz', {
        headers: { Origin: origin, Connection: 'close' }, signal: AbortSignal.timeout(500),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(body, { ok: true });
      return;
    } catch (error) {
      if (error.code === 'ERR_ASSERTION') throw error;
      await delay(50);
    }
  }
  assert.fail(`service did not become healthy at ${origin}: ${child.output()}`);
}

async function verifyService(child, directory, port, origin) {
  await healthy(child, origin);
  const database = join(directory, 'friends.sqlite');
  assert.ok((await stat(database)).isFile(), 'SQLite database must use the configured data directory');
  const bytes = await readFile(database);
  assert.equal(bytes.subarray(0, 16).toString(), 'SQLite format 3\0');
  // A different Host distinguishes configured PUBLIC_ORIGIN from its fallback.
  const configuredOrigin = await fetch(origin + '/healthz', {
    headers: { Host: 'reverse-proxy.internal', Origin: origin, Connection: 'close' },
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(configuredOrigin.status, 200, 'the configured public origin must override request Host');
  assert.deepEqual(await configuredOrigin.json(), { ok: true });
  const denied = await fetch(origin + '/healthz', {
    headers: { Origin: 'https://not-the-public-origin.invalid', Connection: 'close' },
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(denied.status, 403);
  await denied.arrayBuffer();
  child.stop();
  const result = await within(child.closed, timeout, `service failed to shut down: ${child.output()}`);
  assert.ifError(result.error);
  assert.equal(result.code, 0, child.output());
  assert.equal(result.signal, null, 'shutdown must run the graceful signal handler');
  await assertPortAvailable(port);
}

test('npm package exposes only the service executable and a narrow publish whitelist', () => {
  assert.equal(pkg.name, 'dsh-friends-service');
  assert.equal(pkg.version, '0.8.2');
  assert.notEqual(pkg.private, true);
  assert.deepEqual(pkg.bin, { 'dsh-friends-service': 'server/cli.mjs' });
  assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, 'publishing needs an explicit files whitelist');
  for (const entry of pkg.files) {
    assert.equal(typeof entry, 'string');
    const path = entry.replaceAll('\\', '/').replace(/^\.\//, '');
    assert.ok(path && path !== '.' && !path.includes('..') && !path.startsWith('/') && !/[:*?\[\]{}]/.test(path), `whitelist must be narrow: ${entry}`);
    assert.ok(!/(^|\/)(plugin|test|tools|data)(\/|$)/i.test(path), `private/development files must not be published: ${entry}`);
  }
  assert.ok(pkg.files.some((entry) => /^(\.\/)?server\/?$/.test(entry) || /^(\.\/)?server\/cli\.mjs$/.test(entry)), 'whitelist must include the bin target');
});

for (const flag of ['--help', '-h']) {
  test(`CLI ${flag} prints usage without creating data or starting a service`, { timeout: 20_000 }, async (t) => {
    const result = await quickExit(t, [flag], 0);
    assert.match(result.stdout, /dsh-friends-service/);
    for (const option of ['--host', '--port', '--data-dir', '--public-origin']) assert.ok(result.stdout.includes(option), `help must explain ${option}`);
  });
}

for (const flag of ['--version', '-v']) {
  test(`CLI ${flag} matches package.json without creating data or starting a service`, { timeout: 20_000 }, async (t) => {
    const result = await quickExit(t, [flag], 0);
    assert.equal(result.stdout.trim(), pkg.version);
  });
}

test('CLI rejects unknown arguments before creating data or starting a service', { timeout: 20_000 }, async (t) => {
  const result = await quickExit(t, ['--not-a-real-option'], 1);
  assert.match(result.stderr, /unknown|unexpected|unrecognized|invalid|未知|不支持/i);
});

for (const port of ['0', '-1', '65536', '1.5', 'abc', '', '12abc']) {
  test(`CLI rejects invalid port ${JSON.stringify(port)} without creating data`, { timeout: 20_000 }, async (t) => {
    const result = await quickExit(t, ['--port', port], 1);
    assert.match(result.stderr, /port|端口/i);
  });
}

test('CLI flags start a real isolated service, override the environment and shut down cleanly', { timeout: 30_000 }, async (t) => {
  const f = await fixture(t);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const directory = join(f.directory, 'CLI data with spaces');
  const child = f.launch(['--host', '127.0.0.1', '--port', String(port), '--data-dir', directory, '--public-origin', origin], {
    HOST: '192.0.2.1', PORT: 'invalid-env-port', DATA_DIR: join(f.directory, 'unused env data'),
    PUBLIC_ORIGIN: 'https://unused-env-origin.invalid',
  }, true);
  await verifyService(child, directory, port, origin);
  await absent(join(f.directory, 'unused env data'));
  await absent(join(f.directory, 'data'));
});

test('CLI with no arguments preserves HOST/PORT/DATA_DIR/PUBLIC_ORIGIN startup', { timeout: 30_000 }, async (t) => {
  const f = await fixture(t);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const directory = join(f.directory, 'environment data');
  const child = f.launch([], {
    HOST: '127.0.0.1', PORT: String(port), DATA_DIR: directory, PUBLIC_ORIGIN: origin,
  }, true);
  await verifyService(child, directory, port, origin);
  await absent(join(f.directory, 'data'));
});
