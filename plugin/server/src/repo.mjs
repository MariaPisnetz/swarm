// Local mirror of a project repository, kept under ~/.swarm/repos. The mirror's working tree
// always sits at the remote default branch, so the tasks and manifests read from it are the
// maintainers' merged versions.
import fs from 'node:fs';
import path from 'node:path';
import { SWARM_HOME, ensureDir, must, run } from './util.mjs';
import { git } from './verify.mjs';
import { loadProjects } from './project.mjs';

const GITHUB_SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Turn a --repo value into { kind, url, slug, github }. */
export function resolveRepo(spec) {
  if (!spec) throw new Error('No repository given. Pass --repo <owner/name | git url | path> or run `swarm init --repo ...`.');
  if (fs.existsSync(spec)) {
    const abs = fs.realpathSync(spec);
    return { kind: 'git', url: abs, slug: `local-${path.basename(abs).replace(/\.git$/, '')}`, github: null };
  }
  const gh = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(spec);
  if (gh || GITHUB_SLUG.test(spec)) {
    const slug = gh ? gh[1] : spec;
    return { kind: 'github', url: `https://github.com/${slug}.git`, slug: slug.replace('/', '--'), github: slug };
  }
  return { kind: 'git', url: spec, slug: spec.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, ''), github: null };
}

export async function defaultBranch(cwd) {
  const out = await must('git', ['ls-remote', '--symref', 'origin', 'HEAD'], { cwd });
  const m = /ref: refs\/heads\/(\S+)\s+HEAD/.exec(out);
  if (!m) throw new Error('Could not determine the default branch of the remote (is the repository empty?)');
  return m[1];
}

/** Clone or update the mirror and return { dir, branch, base, projects }. */
export async function syncMirror(repo) {
  const dir = path.join(SWARM_HOME, 'repos', repo.slug);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    ensureDir(path.dirname(dir));
    await must('git', ['clone', '--quiet', repo.url, dir]);
  } else {
    await git(dir, ['remote', 'set-url', 'origin', repo.url]);
  }
  await git(dir, ['fetch', '--quiet', '--prune', 'origin']);
  const branch = await defaultBranch(dir);
  await git(dir, ['checkout', '--quiet', '--detach', `origin/${branch}`]);
  await git(dir, ['clean', '-fdq']);
  const base = (await git(dir, ['rev-parse', 'HEAD'])).trim();
  return { dir, branch, base, projects: loadProjects(dir) };
}

/** Fresh clone for one unit of work. Agents never run inside the mirror or the user's own repos. */
export async function makeWorkDir(repo, mirror, { name, commit, branch }) {
  const dir = path.join(SWARM_HOME, 'work', repo.slug, `${name}-${Date.now().toString(36)}`);
  ensureDir(path.dirname(dir));
  await must('git', ['clone', '--quiet', '--no-checkout', mirror.dir, dir]);
  await git(dir, ['remote', 'set-url', 'origin', repo.url]);
  await git(dir, branch ? ['checkout', '--quiet', '-b', branch, commit] : ['checkout', '--quiet', '--detach', commit]);
  const email = await run('git', ['config', 'user.email'], { cwd: dir });
  if (!email.stdout.trim()) {
    await git(dir, ['config', 'user.email', 'swarm-worker@users.noreply.github.com']);
    await git(dir, ['config', 'user.name', 'Swarm worker']);
  }
  return dir;
}

/**
 * Load project manifests as they were at `commit`, without checking it out.
 * Used by CI and reviews so a submission cannot supply its own rules.
 */
export async function loadProjectsAt(cwd, commit) {
  const tmp = fs.mkdtempSync(path.join(ensureDir(path.join(SWARM_HOME, 'tmp')), 'base-'));
  try {
    const files = (await git(cwd, ['ls-tree', '-r', '--name-only', commit, '.swarm/projects'])).split('\n').filter(Boolean);
    for (const f of files) {
      const dest = path.join(tmp, f);
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, await git(cwd, ['show', `${commit}:${f}`]));
    }
    return loadProjects(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
