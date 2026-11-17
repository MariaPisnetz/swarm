import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleSnippet } from '../../../../src/schedule.mjs';

test('launchd plist on macOS', () => {
  const s = scheduleSnippet({ platform: 'darwin', nodePath: '/opt/my node/bin/node', binPath: '/Users/a&b/swarm.mjs' });
  assert.equal(s.kind, 'launchd');
  assert.match(s.text, /<\?xml/);
  assert.match(s.text, /<string>home\.swarm\.donate<\/string>/);
  assert.match(s.text, /<string>\/opt\/my node\/bin\/node<\/string>/);
  assert.match(s.text, /<string>\/Users\/a&amp;b\/swarm\.mjs<\/string>/);
  assert.match(s.text, /<string>run<\/string>\s*<string>--only-if-expiring<\/string>\s*<string>12<\/string>\s*<string>--max-tasks<\/string>\s*<string>1<\/string>/);
  assert.match(s.text, /<key>StartInterval<\/key>\s*<integer>3600<\/integer>/);
  assert.match(s.installHint, /LaunchAgents\/home\.swarm\.donate\.plist/);
  assert.match(s.installHint, /launchctl load/);
});

test('cron line elsewhere', () => {
  const s = scheduleSnippet({ platform: 'linux', nodePath: '/usr/bin/node', binPath: '/home/me/my tools/swarm.mjs', hours: 6, maxTasks: 3 });
  assert.equal(s.kind, 'cron');
  assert.match(s.text, /^17 \* \* \* \* /);
  assert.ok(s.text.includes('"/home/me/my tools/swarm.mjs"') || s.text.includes("'/home/me/my tools/swarm.mjs'"));
  assert.match(s.text, /run --only-if-expiring 6 --max-tasks 3/);
  assert.equal(s.text.trim().split('\n').length, 1);
  assert.match(s.installHint, /crontab -e/);
});
