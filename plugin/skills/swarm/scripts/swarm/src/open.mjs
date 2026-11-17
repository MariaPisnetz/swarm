// Opens a project repository for work: mirror, rules and the board that coordinates it.
import path from 'node:path';
import { SWARM_HOME, which } from './util.mjs';
import { resolveRepo, syncMirror, loadProjectsAt } from './repo.mjs';
import { GitBoard } from './board/git.mjs';
import { GitHubBoard } from './board/github.mjs';

/**
 * With `at` ({ base, branch }) the mirror is not fetched and the rules are read as of that
 * commit, which is how an in-progress session keeps working against the rules it started with.
 */
export async function openRepo(spec, identity, { at } = {}) {
  const repo = resolveRepo(spec);
  if (repo.kind === 'github' && !(await which('gh'))) throw new Error('GitHub repositories need the `gh` CLI (https://cli.github.com), logged in.');
  let mirror;
  if (at) {
    const dir = path.join(SWARM_HOME, 'repos', repo.slug);
    mirror = { dir, branch: at.branch, base: at.base, projects: await loadProjectsAt(dir, at.base) };
  } else {
    mirror = await syncMirror(repo);
  }
  const board = repo.kind === 'github' ? new GitHubBoard({ repo: repo.github, mirror, identity }) : new GitBoard({ mirror, identity });
  return { repo, mirror, board };
}
