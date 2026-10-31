// Read-only packaged-source inspector used while implementing the adapter.
import { readFileSync } from 'node:fs';
const [path, target, needle, radius = '8'] = process.argv.slice(2);
const data = readFileSync(path), length = data.readUInt32LE(12);
let node = JSON.parse(data.subarray(16, 16 + length));
for (const part of target.split('/')) node = node.files[part];
if (!node || node.files || node.unpacked) throw new Error('Not a packed file');
const lines = data.subarray(16 + length + Number(node.offset), 16 + length + Number(node.offset) + node.size).toString('utf8').split(/\r?\n/);
const ranges = new Set();
for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) for (let j = Math.max(0, i - Number(radius)); j <= Math.min(lines.length - 1, i + Number(radius)); j++) ranges.add(j);
for (const line of [...ranges].sort((a,b) => a-b).slice(0, 250)) console.log(`${line + 1}|${lines[line]}`);
