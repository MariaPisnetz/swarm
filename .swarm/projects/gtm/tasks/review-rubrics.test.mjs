import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gtm = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'gtm');
const channels = fs.readdirSync(path.join(gtm, 'channels')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(gtm, 'channels', f), 'utf8')).id);

for (const id of channels) {
  test(`rubric for ${id}`, () => {
    const text = fs.readFileSync(path.join(gtm, 'rubrics', `${id}.md`), 'utf8');
    const section = (name) => {
      const m = new RegExp(`^## ${name}\\s*\\n([\\s\\S]*?)(?=^## )`, 'm').exec(text + '\n## ');
      assert.ok(m, `missing section: ${name}`);
      return m[1];
    };
    assert.ok(section('Reader').trim().length > 60);
    const criteria = section('Criteria').split('\n').filter((l) => l.startsWith('- [ ] '));
    assert.ok(criteria.length >= 5 && criteria.length <= 8, `${criteria.length} criteria`);
    assert.ok(criteria.some((c) => /limit/i.test(c)), 'needs a criterion about limitations');
    const rejects = section('Automatic reject').split('\n').filter((l) => /^[-*] /.test(l));
    assert.ok(rejects.length >= 2 && rejects.length <= 4, `${rejects.length} automatic rejects`);
  });
}
