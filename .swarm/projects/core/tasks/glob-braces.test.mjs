import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp, matchesAny } from '../../../../src/util.mjs';

test('brace alternation', () => {
  const g = globToRegExp('src/{cli,worker}.mjs');
  assert.ok(g.test('src/cli.mjs'));
  assert.ok(g.test('src/worker.mjs'));
  assert.ok(!g.test('src/util.mjs'));
  assert.ok(!g.test('src/cli,worker.mjs'));
  assert.ok(!g.test('src/{cli,worker}.mjs'));
});

test('alternatives may contain wildcards', () => {
  assert.ok(matchesAny('docs/a/b.md', ['**/*.{md,txt}']));
  assert.ok(matchesAny('notes.txt', ['**/*.{md,txt}']));
  assert.ok(!matchesAny('notes.rst', ['**/*.{md,txt}']));
  assert.ok(matchesAny('test/x/y.mjs', ['{src,test}/**']));
  assert.ok(!matchesAny('lib/x.mjs', ['{src,test}/**']));
});

test('unclosed brace is literal; existing behaviour unchanged', () => {
  assert.ok(globToRegExp('a{b').test('a{b'));
  assert.ok(!globToRegExp('a{b').test('ab'));
  assert.ok(globToRegExp('src/*.mjs').test('src/a.mjs'));
  assert.ok(!globToRegExp('src/*.mjs').test('src/a/b.mjs'));
  assert.ok(globToRegExp('a.b').test('a.b'));
  assert.ok(!globToRegExp('a.b').test('axb'));
});
