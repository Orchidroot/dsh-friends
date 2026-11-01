#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';

const help = `DSH Friends service

Usage:
  dsh-friends-service [options]

Options:
  -h, --help                  Show this help and exit
  -v, --version               Show the package version and exit
      --host <address>        Listen address (default: 127.0.0.1)
      --port <number>         Listen port (default: 8787)
      --data-dir <directory>  SQLite directory (default: ./data)
      --public-origin <url>   Public HTTPS origin behind your reverse proxy

Environment: HOST, PORT, DATA_DIR, PUBLIC_ORIGIN, SIGNUP_CODE,
             REGISTER_LIMIT_HOUR, IP_LIMIT_MINUTE, IDENTITY_LIMIT_MINUTE
CLI options override their matching environment variables.

The server runs in the foreground. Data paths are relative to the current
working directory, not the npm installation or npx cache. Use a stable data
path on a server. For remote access, put an HTTPS reverse proxy in front of
this service; this command does not install or configure one.
`;

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        host: { type: 'string' },
        port: { type: 'string' },
        'data-dir': { type: 'string' },
        'public-origin': { type: 'string' },
      },
      allowPositionals: false,
      strict: true,
    }));
    if (values.help) {
      console.log(help);
      return;
    }
    if (values.version) {
      const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
      console.log(metadata.version);
      return;
    }
    if (Number(process.versions.node.split('.')[0]) < 24) {
      throw new Error('Node.js 24 or newer is required.');
    }
    if (values.port !== undefined && (!/^\d+$/.test(values.port) || Number(values.port) < 1 || Number(values.port) > 65535)) {
      throw new Error('--port must be an integer from 1 to 65535.');
    }
    for (const [option, environment] of Object.entries({
      host: 'HOST',
      port: 'PORT',
      'data-dir': 'DATA_DIR',
      'public-origin': 'PUBLIC_ORIGIN',
    })) {
      if (values[option] === undefined) continue;
      if (!values[option].trim()) throw new Error(`--${option} must not be empty.`);
      process.env[environment] = values[option];
    }
  } catch (error) {
    console.error(`DSH Friends: ${error.message}`);
    console.error('Run dsh-friends-service --help for usage.');
    process.exitCode = 1;
    return;
  }
  await import('./main.mjs');
}

await main();
