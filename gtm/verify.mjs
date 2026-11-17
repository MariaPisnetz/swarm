#!/usr/bin/env node
// Runs every check on every asset in gtm/assets. Exit code 1 if any asset fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, checkAsset } from './checks/lib.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const ctx = loadContext(root);
const dir = path.join(root, 'assets');
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.md')).map((f) => path.join(dir, String(f))).sort()
  : [];

let failed = 0;
for (const file of files) {
  const res = checkAsset(file, ctx);
  const rel = path.relative(root, file);
  if (res.ok) {
    console.log(`ok    ${rel}  (${res.channel})`);
    continue;
  }
  failed++;
  console.log(`FAIL  ${rel}  (${res.channel || 'no channel'})`);
  for (const [check, problems] of Object.entries(res.results)) for (const p of problems) console.log(`      ${check}: ${p}`);
}
console.log(`\n${files.length - failed}/${files.length} assets pass`);
process.exit(failed ? 1 : 0);
