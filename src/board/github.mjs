// Coordination over GitHub, through the `gh` CLI. No server, no tokens handled by Swarm.
//
//   claim        a draft pull request titled "[swarm] <project>/<task>: ..." holding one empty
//                commit. PR numbers are assigned in order by GitHub, so the lowest live number wins.
//   submission   the same pull request, marked ready, holding the work and receipt commits
//   review       a pull request comment carrying a signed review document
//
// Volunteers without push access work from their own fork.
import { must, run } from '../util.mjs';
import { git } from '../verify.mjs';

const TITLE = /^\[swarm\] ([a-z0-9-]+)\/([a-z0-9-]+)/;
const REVIEW_MARK = '<!-- swarm:review -->';
const WORKER_MARK = /<!-- swarm:worker ([0-9a-f]{16}) -->/;

export class GitHubBoard {
  kind = 'github';

  constructor({ repo, mirror, identity }) {
    this.repo = repo; // "owner/name"
    this.mirror = mirror;
    this.identity = identity;
  }

  gh(args, opts) {
    return must('gh', args, opts);
  }

  async login() {
    this._login ??= (await this.gh(['api', 'user', '-q', '.login'])).trim();
    return this._login;
  }

  async canPush() {
    this._perm ??= (await this.gh(['repo', 'view', this.repo, '--json', 'viewerPermission', '-q', '.viewerPermission'])).trim();
    return ['ADMIN', 'MAINTAIN', 'WRITE'].includes(this._perm);
  }

  /** Name of the git remote to push work to, creating the volunteer's fork when needed. */
  async #pushRemote(workDir) {
    if (await this.canPush()) return { remote: 'origin', owner: this.repo.split('/')[0] };
    const me = await this.login();
    const name = this.repo.split('/')[1];
    await run('gh', ['repo', 'fork', this.repo, '--clone=false']);
    const proto = (await run('gh', ['config', 'get', 'git_protocol', '-h', 'github.com'])).stdout.trim();
    const url = proto === 'ssh' ? `git@github.com:${me}/${name}.git` : `https://github.com/${me}/${name}.git`;
    await run('git', ['remote', 'remove', 'fork'], { cwd: workDir });
    await git(workDir, ['remote', 'add', 'fork', url]);
    return { remote: 'fork', owner: me };
  }

  async #openPrs() {
    const out = await this.gh(['pr', 'list', '-R', this.repo, '--state', 'open', '--limit', '500', '--json', 'number,title,isDraft,createdAt,author,headRefOid,body,url']);
    return JSON.parse(out)
      .map((pr) => {
        const m = TITLE.exec(pr.title);
        if (!m) return null;
        return { ...pr, taskRef: `${m[1]}/${m[2]}`, worker: WORKER_MARK.exec(pr.body || '')?.[1] || `gh:${pr.author?.login}` };
      })
      .filter(Boolean)
      .sort((a, b) => a.number - b.number);
  }

  async claims(projects = this.mirror.projects) {
    const ttl = new Map(projects.map((p) => [p.id, p.claimTtlMinutes]));
    const live = new Map();
    for (const pr of await this.#openPrs()) {
      const minutes = ttl.get(pr.taskRef.split('/')[0]) ?? 90;
      const exp = new Date(new Date(pr.createdAt).getTime() + minutes * 60_000);
      if (pr.isDraft && exp < new Date()) continue; // stale claim
      const list = live.get(pr.taskRef) || [];
      list.push({ worker: pr.worker, number: pr.number, submitted: !pr.isDraft, exp: exp.toISOString(), mine: pr.worker === this.identity.id });
      live.set(pr.taskRef, list);
    }
    return live;
  }

  branchFor(task) {
    return `swarm/${task.ref}/${this.identity.id.slice(0, 8)}`;
  }

  async claim({ project, task, workDir, branch, base }) {
    const { remote, owner } = await this.#pushRemote(workDir);
    await git(workDir, ['commit', '--quiet', '--allow-empty', '-m', `swarm: claim ${task.ref}`]);
    await git(workDir, ['push', '--quiet', '--force', remote, `${branch}:refs/heads/${branch}`]);
    await git(workDir, ['reset', '--quiet', '--hard', base]);
    const body = [
      `Claimed by a Swarm worker. The agent is working on \`${task.ref}\`; this draft becomes a submission when verification passes locally.`,
      '',
      `<!-- swarm:worker ${this.identity.id} -->`,
    ].join('\n');
    const url = (
      await this.gh(['pr', 'create', '-R', this.repo, '--draft', '--base', this.mirror.branch, '--head', `${owner}:${branch}`, '--title', `[swarm] ${task.ref}: ${task.title}`, '--body', body])
    )
      .trim()
      .split('\n')
      .pop();
    const number = Number(url.split('/').pop());
    const handle = { number, url, remote };
    // Lowest live PR number wins. If enough earlier claims exist, back off.
    const earlier = ((await this.claims()).get(task.ref) || []).filter((c) => c.number < number && !c.mine);
    if (earlier.length >= project.replication) {
      await this.release(handle, 'Another worker claimed this task first.');
      return null;
    }
    return handle;
  }

  async release(handle, reason = 'Released: verification did not pass on the worker machine.') {
    if (!handle) return;
    await run('gh', ['pr', 'close', String(handle.number), '-R', this.repo, '--comment', reason]);
  }

  async submit({ workDir, branch, claim, project, task, receipt, summary }) {
    await git(workDir, ['push', '--quiet', '--force', claim.remote, `${branch}:refs/heads/${branch}`]);
    const body = [
      `Swarm submission for \`${task.ref}\`: **${task.title}**`,
      '',
      summary ? `### Agent summary\n\n${summary.slice(0, 6000)}` : '',
      '',
      '### Receipt',
      '',
      `- worker \`${receipt.signer.id}\` (${receipt.signer.handle})`,
      `- agent \`${receipt.agent.runner}\` / \`${receipt.agent.model}\`, ${receipt.attempts} attempt(s), API-equivalent cost $${receipt.usage.costUsd.toFixed(2)}`,
      `- verified locally in \`${receipt.sandbox}\` sandbox: ${receipt.verify.map((v) => `\`${v.name}\``).join(', ')}`,
      `- ${receipt.filesChanged} file(s), ${receipt.linesChanged} line(s) changed`,
      '',
      `CI re-runs verification from the base branch's rules. Merging needs ${project.review.quorum} independent \`swarm review\` approval(s).`,
      '',
      `<!-- swarm:worker ${this.identity.id} -->`,
    ].join('\n');
    await this.gh(['pr', 'edit', String(claim.number), '-R', this.repo, '--body', body]);
    await this.gh(['pr', 'ready', String(claim.number), '-R', this.repo]);
    return { id: claim.number, where: claim.url };
  }

  async submissions() {
    return (await this.#openPrs())
      .filter((pr) => !pr.isDraft)
      .map((pr) => ({ id: pr.number, taskRef: pr.taskRef, worker: pr.worker, head: pr.headRefOid, url: pr.url, mine: pr.worker === this.identity.id }));
  }

  async fetchSubmission(sub) {
    await git(this.mirror.dir, ['fetch', '--quiet', 'origin', `pull/${sub.id}/head`]);
    return (await git(this.mirror.dir, ['rev-parse', 'FETCH_HEAD'])).trim();
  }

  async postReview(sub, review) {
    const icon = review.verdict === 'approve' ? '✅' : '❌';
    const body = [
      REVIEW_MARK,
      `${icon} **Swarm review: ${review.verdict}** by worker \`${review.signer.id}\` using \`${review.agent.runner}\` / \`${review.agent.model}\``,
      '',
      review.notes,
      '',
      '<details><summary>Signed review</summary>',
      '',
      '```json',
      JSON.stringify(review, null, 2),
      '```',
      '</details>',
    ].join('\n');
    await this.gh(['pr', 'comment', String(sub.id), '-R', this.repo, '--body', body]);
    return { where: sub.url };
  }

  async reviews(sub) {
    const out = await this.gh(['pr', 'view', String(sub.id), '-R', this.repo, '--json', 'comments']);
    const docs = [];
    for (const c of JSON.parse(out).comments || []) {
      if (!c.body?.includes(REVIEW_MARK)) continue;
      const m = /```json\n([\s\S]*?)\n```/.exec(c.body);
      try {
        if (m) docs.push(JSON.parse(m[1]));
      } catch {
        /* malformed review comments are ignored */
      }
    }
    return docs;
  }

  async merge(sub) {
    // A merge commit keeps the work commit (and so the receipt's tree hash) in history.
    await this.gh(['pr', 'merge', String(sub.id), '-R', this.repo, '--merge']);
    return { where: sub.url };
  }
}
