// Deterministic checks for go-to-market copy. Each check takes an asset and the harness
// context and returns a list of problems (strings). An empty list means the check passed.
//
// These checks cannot tell whether copy is good. They can tell when it is unsupported,
// off-spec or padded, which is what makes agent-written copy unsafe to ship unreviewed.
import fs from 'node:fs';
import path from 'node:path';

export function parseAsset(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  const meta = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return { file, meta, body: m ? m[2] : text };
}

export function loadContext(root) {
  const facts = JSON.parse(fs.readFileSync(path.join(root, 'facts.json'), 'utf8'));
  const channels = {};
  for (const f of fs.readdirSync(path.join(root, 'channels')).filter((x) => x.endsWith('.json'))) {
    const ch = JSON.parse(fs.readFileSync(path.join(root, 'channels', f), 'utf8'));
    channels[ch.id] = ch;
  }
  return { root, facts, channels };
}

/** Prose only: code blocks, inline code and link targets are not copy. */
export function prose(body) {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\]\([^)]*\)/g, ']');
}

export const words = (text) => text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));

// Phrases that signal padding or hype. Matched case-insensitively on word boundaries.
export const SLOP = [
  'revolutionary', 'revolutionize', 'game-changing', 'game changer', 'cutting-edge', 'seamless', 'seamlessly',
  'supercharge', 'unlock', 'unleash', 'effortless', 'effortlessly', 'world-class', 'best-in-class', 'next-generation',
  'blazing', 'blazingly', 'delve', 'leverage', 'robust', 'paradigm', 'synergy', 'empower', 'elevate',
  "in today's", 'fast-paced', 'look no further', 'the future of', 'say goodbye to', 'not just', "it's not about",
  'at the end of the day', 'needless to say', "let's dive in", 'dive into',
];

export function checkSlop(asset) {
  const problems = [];
  const text = prose(asset.body);
  for (const phrase of SLOP) {
    const re = new RegExp(`(^|[^A-Za-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`, 'i');
    if (re.test(text)) problems.push(`hype or filler phrase: "${phrase}"`);
  }
  if (/!/.test(text.replace(/!\[/g, ''))) problems.push('exclamation mark in copy');
  if (/\p{Extended_Pictographic}/u.test(text)) problems.push('emoji in copy');
  const dashes = (text.match(/—/g) || []).length;
  if (dashes > 2) problems.push(`${dashes} em dashes; use at most 2`);
  return problems;
}

const NUMBER = /\$\d[\d,.]*[kKmM]?\+?|\d[\d,.]*\s?%|\d[\d,.]*\+?\s?x\b|\b\d[\d,.]*\+?\s(?:attempts?|minutes?|hours?|days?|weeks?|developers?|users?|volunteers?|stars?|tasks?|projects?|repos(?:itories)?|lines)\b/gi;
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').replace(/,/g, '').trim().replace(/\.+$/, '');

export function checkClaims(asset, ctx) {
  const problems = [];
  const text = prose(asset.body);
  const allowed = new Set(ctx.facts.numbers.map(norm));
  for (const raw of text.match(NUMBER) || []) {
    const n = norm(raw);
    if (!allowed.has(n) && !allowed.has(n.replace(/s$/, ''))) problems.push(`number not backed by facts.json: "${raw.trim()}"`);
  }
  for (const line of text.split('\n')) {
    for (const { phrase, why } of ctx.facts.forbidden) {
      const re = new RegExp(`(^|[^A-Za-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (!re.test(line)) continue;
      // A forbidden topic may be mentioned only to deny it, or in a question being answered.
      if (/\b(not|no|never|nothing|isn't|aren't|without)\b/i.test(line) || /\?\s*$/.test(line)) continue;
      problems.push(`forbidden claim "${phrase}": ${why}`);
    }
  }
  return problems;
}

export function checkStructure(asset, ctx) {
  const problems = [];
  const channel = ctx.channels[asset.meta.channel];
  if (!channel) return [`frontmatter "channel" must be one of: ${Object.keys(ctx.channels).sort().join(', ')}`];
  if (!asset.meta.title) problems.push('frontmatter "title" is missing');
  const count = words(prose(asset.body)).length;
  if (count < channel.minWords) problems.push(`${count} words; the ${channel.id} channel needs at least ${channel.minWords}`);
  if (count > channel.maxWords) problems.push(`${count} words; the ${channel.id} channel allows at most ${channel.maxWords}`);
  const headings = [...asset.body.matchAll(/^#{1,4}\s+(.+?)\s*$/gm)].map((m) => m[1].toLowerCase());
  for (const h of channel.requiredHeadings || []) {
    if (!headings.some((x) => x.includes(h.toLowerCase()))) problems.push(`missing required section: "${h}"`);
  }
  if (channel.minQuestions) {
    const questions = headings.filter((h) => h.endsWith('?')).length;
    if (questions < channel.minQuestions) problems.push(`${questions} question headings; the ${channel.id} channel needs at least ${channel.minQuestions}`);
  }
  return problems;
}

export function checkLinks(asset, ctx) {
  const problems = [];
  const stripped = asset.body.replace(/```[\s\S]*?```/g, ' ');
  for (const m of stripped.matchAll(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
    const target = m[1];
    if (/^https?:\/\//.test(target)) {
      if (!ctx.facts.links.some((prefix) => target.startsWith(prefix))) problems.push(`external link not on the facts.json allowlist: ${target}`);
    } else if (!target.startsWith('#') && !target.startsWith('mailto:')) {
      const resolved = path.resolve(path.dirname(asset.file), target.split('#')[0]);
      if (!fs.existsSync(resolved)) problems.push(`broken relative link: ${target}`);
    }
  }
  for (const m of stripped.matchAll(/(?<![(<\w])https?:\/\/\S+/g)) {
    if (!ctx.facts.links.some((prefix) => m[0].startsWith(prefix))) problems.push(`external link not on the facts.json allowlist: ${m[0]}`);
  }
  return problems;
}

export const CHECKS = { structure: checkStructure, claims: checkClaims, slop: checkSlop, links: checkLinks };

export function checkAsset(file, ctx) {
  const asset = parseAsset(file);
  const results = {};
  for (const [name, fn] of Object.entries(CHECKS)) results[name] = fn(asset, ctx);
  return { file, channel: asset.meta.channel, results, ok: Object.values(results).every((p) => p.length === 0) };
}
