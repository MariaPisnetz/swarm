#!/usr/bin/env node
// Copies the CLI into the plugin's skill, under skills/swarm/scripts/swarm. A skill's scripts
// travel with it to every place skills load, including cloud sessions, so the same copy serves
// the local connector and the shell path, with no network and no npm at session start. The copy
// is a snapshot that a maintainer cuts on purpose, so plugin users run a reviewed release rather
// than every merge.
//
//   node scripts/build-plugin.mjs           rebuild the copy
//   node scripts/build-plugin.mjs --check   exit 1 if the copy is out of date
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'plugin', 'skills', 'swarm', 'scripts', 'swarm');
const check = process.argv.includes('--check');

function plan() {
  const files = new Map();
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), path.posix.join(rel, e.name));
      else if (e.name.endsWith('.mjs') || e.name.endsWith('.json')) files.set(path.posix.join(rel, e.name), fs.readFileSync(path.join(dir, e.name)));
    }
  };
  walk(path.join(root, 'src'), 'src');
  // Not named bin/: claude.ai and Cowork refuse plugins that have a top-level bin directory.
  files.set('cli/swarm.mjs', fs.readFileSync(path.join(root, 'bin', 'swarm.mjs')));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const slim = { name: pkg.name, version: pkg.version, type: 'module', private: true, license: pkg.license, swarm: pkg.swarm };
  files.set('package.json', Buffer.from(JSON.stringify(slim, null, 2) + '\n'));
  return files;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const files = plan();

if (check) {
  const stale = [...files].filter(([rel, buf]) => !fs.existsSync(path.join(out, rel)) || sha(fs.readFileSync(path.join(out, rel))) !== sha(buf)).map(([rel]) => rel);
  if (stale.length) {
    console.log(`The plugin's copy of the CLI is out of date (${stale.length} file(s), e.g. ${stale[0]}). Run: node scripts/build-plugin.mjs`);
    process.exit(1);
  }
  console.log("The plugin's copy of the CLI is up to date");
} else {
  fs.rmSync(out, { recursive: true, force: true });
  for (const [rel, buf] of files) {
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.writeFileSync(path.join(out, rel), buf);
  }
  console.log(`Wrote ${files.size} files to ${path.relative(root, out)}`);
}
