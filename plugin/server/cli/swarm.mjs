#!/usr/bin/env node
import { main } from '../src/cli.mjs';

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`\x1b[31m✗\x1b[0m ${err.message}\n`);
  if (process.env.SWARM_DEBUG) process.stderr.write(`${err.stack}\n`);
  process.exitCode = 1;
});
