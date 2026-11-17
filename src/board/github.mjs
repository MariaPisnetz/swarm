// Coordination over GitHub, through the `gh` CLI. No server, no tokens handled by Swarm.
//
// Pull requests are expensive for maintainers, so they are reserved for work that already
// passed verification. Everything before that is an append-only log on one issue per task:
//
//   task issue   "[swarm] <project>/<task>: ..." opened by a maintainer (`swarm sync`). The task
//                file in the repository stays the source of truth; the issue is the log.
//   claim        a signed comment on that issue. GitHub orders comments, so the earliest live
//                claim wins. Claims expire; the clock is GitHub's comment timestamp.
//   release      a signed comment by the same worker, optionally naming the verify step that
//                failed. Later workers are told which checks tripped others up.
//   submission   a pull request, opened only after verification passed on the worker's machine
//   review       a pull request comment carrying a signed review document
//
// Volunteers without push access work from their own fork.
import { must, run } from '../util.mjs';
import { signDoc, verifyDoc } from '../identity.mjs';
import { git } from '../verify.mjs';

const TITLE = /^\[swarm\] ([a-z0-9-]+)\/([a-z0-9-]+)/;
const MARK = /<!-- swarm:(claim|release) ([A-Za-z0-9+/=]+) -->/;
const REVIEW_MARK = '<!-- swarm:review -->';
const WORKER_MARK = /<!-- swarm:worker ([0-9a-f]{16}) -->/;
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const encode = (doc) => Buffer.from(JSON.stringify(doc)).toString('base64');

/** Parse a claim or release marker out of a comment body. Returns a verified doc or null. */
export function parseMarker(body, taskRef) {
  const m = MARK.exec(body || '');
  if (!m) return null;
  try {
    const doc = JSON.parse(Buffer.from(m[2], 'base64').toString('utf8'));
    if (doc.kind !== m[1] || doc.task !== taskRef || !verifyDoc(doc).ok) return null;
    return doc;
  } catch {
    return null;
  }
}

/**
 * Replay a task issue's comments, oldest first.
 * Returns the live claims in winning order and how often each verify step failed before.
 * Only signed markers count, and a worker can release only its own claim.
 */
export function resolveClaims(comments, { taskRef, ttlMinutes, now = Date.now(), knownSteps = [] }) {
  let live = [];
  const failures = {};
  const steps = new Set([...knownSteps, 'policy', 'agent']);
  for (const c of comments) {
    const doc = parseMarker(c.body, taskRef);
    if (!doc) continue;
    const worker = doc.signer.id;
    if (doc.kind === 'claim') {
      const exp = new Date(c.createdAt).getTime() + ttlMinutes * 60_000;
      live = live.filter((x) => x.worker !== worker);
      if (exp > now) live.push({ worker, commentId: c.id, exp: new Date(exp).toISOString() });
    } else {
      live = live.filter((x) => x.worker !== worker);
      // The step name is fed to other workers' agents, so it must be one we already know.
      if (steps.has(doc.failedStep)) failures[doc.failedStep] = (failures[doc.failedStep] || 0) + 1;
    }
  }
  return { live, failures };
}

const ISSUES_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, states: OPEN, orderBy: { field: CREATED_AT, direction: ASC }) {
      nodes {
        number title url authorAssociation
        author { __typename login }
        comments(last: 100) { nodes { databaseId body createdAt } }
      }
    }
  }
}`;

export class GitHubBoard {
  kind = 'github';
  unpublished = new Set();

  constructor({ repo, mirror, identity }) {
    this.repo = repo; // "owner/name"
    this.mirror = mirror;
    this.identity = identity;
    this.issues = new Map();
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

  /**
   * Git remote to push work to: the project itself for people with push access, otherwise the
   * volunteer's fork (created on first use). The URL follows gh's configured protocol, and over
   * https gh supplies the credential, so Swarm never handles a token.
   */
  async #pushRemote(workDir) {
    const name = this.repo.split('/')[1];
    let owner = this.repo.split('/')[0];
    if (!(await this.canPush())) {
      owner = await this.login();
      await run('gh', ['repo', 'fork', this.repo, '--clone=false']);
    }
    const proto = (await run('gh', ['config', 'get', 'git_protocol', '-h', 'github.com'])).stdout.trim();
    const url = proto === 'ssh' ? `git@github.com:${owner}/${name}.git` : `https://github.com/${owner}/${name}.git`;
    await run('git', ['remote', 'remove', 'swarm-push'], { cwd: workDir });
    await git(workDir, ['remote', 'add', 'swarm-push', url]);
    if (proto !== 'ssh') await git(workDir, ['config', 'credential.https://github.com.helper', '!gh auth git-credential']);
    return { remote: 'swarm-push', owner };
  }

  /** Task issues opened by a maintainer (or by the repository's own Actions bot), by task ref. */
  async #taskIssues() {
    const [owner, name] = this.repo.split('/');
    const out = await this.gh(['api', 'graphql', '-f', `query=${ISSUES_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`]);
    const issues = new Map();
    for (const n of JSON.parse(out).data.repository.issues.nodes) {
      const m = TITLE.exec(n.title);
      const trusted = TRUSTED.has(n.authorAssociation) || (n.author?.__typename === 'Bot' && n.author.login === 'github-actions');
      if (!m || !trusted) continue;
      const ref = `${m[1]}/${m[2]}`;
      if (issues.has(ref)) continue; // the oldest issue for a task is the log
      issues.set(ref, {
        number: n.number,
        url: n.url,
        comments: n.comments.nodes.map((c) => ({ id: c.databaseId, body: c.body, createdAt: c.createdAt })),
      });
    }
    return issues;
  }

  async #openPrs() {
    const out = await this.gh(['pr', 'list', '-R', this.repo, '--state', 'open', '--limit', '500', '--json', 'number,title,author,headRefOid,body,url']);
    return JSON.parse(out)
      .map((pr) => {
        const m = TITLE.exec(pr.title);
        if (!m) return null;
        return { ...pr, taskRef: `${m[1]}/${m[2]}`, worker: WORKER_MARK.exec(pr.body || '')?.[1] || `gh:${pr.author?.login}` };
      })
      .filter(Boolean)
      .sort((a, b) => a.number - b.number);
  }

  #resolve(project, task, issue) {
    return resolveClaims(issue.comments, { taskRef: task.ref, ttlMinutes: project.claimTtlMinutes, knownSteps: [...project.verify, ...task.verify].map((s) => s.name) });
  }

  /** Map of task ref -> live claims and open submissions. Also records which tasks have no issue yet. */
  async claims(projects = this.mirror.projects) {
    this.issues = await this.#taskIssues();
    this.unpublished = new Set();
    this.failures = new Map();
    const live = new Map();
    for (const project of projects) {
      for (const task of project.tasks) {
        const issue = this.issues.get(task.ref);
        if (!issue) {
          this.unpublished.add(task.ref);
          continue;
        }
        const r = this.#resolve(project, task, issue);
        this.failures.set(task.ref, r.failures);
        if (r.live.length) live.set(task.ref, r.live.map((c) => ({ ...c, mine: c.worker === this.identity?.id })));
      }
    }
    for (const pr of await this.#openPrs()) {
      const list = (live.get(pr.taskRef) || []).filter((c) => c.worker !== pr.worker);
      list.push({ worker: pr.worker, number: pr.number, submitted: true, mine: pr.worker === this.identity?.id });
      live.set(pr.taskRef, list);
    }
    return live;
  }

  /** How often each verify step failed for earlier workers on this task. */
  hints(taskRef) {
    return { failures: this.failures?.get(taskRef) || {} };
  }

  branchFor(task) {
    return `swarm/${task.ref}/${this.identity.id.slice(0, 8)}`;
  }

  async #comment(issue, kind, fields, text) {
    const doc = signDoc({ kind, ...fields, ts: new Date().toISOString() }, this.identity);
    const body = `${text}\n\n<!-- swarm:${kind} ${encode(doc)} -->`;
    return (await this.gh(['issue', 'comment', String(issue.number), '-R', this.repo, '--body', body])).trim();
  }

  async claim({ project, task }) {
    const issue = this.issues.get(task.ref) || (await this.#taskIssues()).get(task.ref);
    if (!issue) return null;
    const handle = { issue, task: task.ref };
    await this.#comment(issue, 'claim', { task: task.ref }, `Claimed by Swarm worker \`${this.identity.id}\` (${this.identity.handle}). The claim lapses after ${project.claimTtlMinutes} minutes.`);
    // Earliest live claim wins. Re-read the log and see where ours landed.
    const fresh = (await this.#taskIssues()).get(task.ref);
    const order = fresh ? this.#resolve(project, task, fresh).live.map((c) => c.worker) : [];
    const submitted = (await this.#openPrs()).filter((pr) => pr.taskRef === task.ref && pr.worker !== this.identity.id).length;
    const position = order.indexOf(this.identity.id);
    if (position === -1 || position + submitted >= project.replication) {
      await this.release(handle);
      return null;
    }
    return handle;
  }

  /** Give the task back. `failedStep` (a verify step name, "policy" or "agent") is shared with later workers. */
  async release(handle, { failedStep } = {}) {
    if (!handle?.issue) return;
    const text = failedStep ? `Released by worker \`${this.identity.id}\`: did not get past \`${failedStep}\`. Nothing was pushed.` : `Released by worker \`${this.identity.id}\`.`;
    await this.#comment(handle.issue, 'release', { task: handle.task, failedStep }, text).catch(() => {});
  }

  async submit({ workDir, branch, claim, project, task, receipt, summary }) {
    const { remote, owner } = await this.#pushRemote(workDir);
    await git(workDir, ['push', '--quiet', '--force', remote, `${branch}:refs/heads/${branch}`]);
    const body = [
      `Swarm submission for \`${task.ref}\`: **${task.title}** (task log: #${claim.issue.number})`,
      '',
      'This pull request exists because verification already passed on the worker\'s machine. CI now repeats it from the base branch\'s rules.',
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
      `Merging needs ${project.review.quorum} independent \`swarm review\` approval(s) and a maintainer.`,
      '',
      `<!-- swarm:worker ${this.identity.id} -->`,
    ].join('\n');
    const url = (await this.gh(['pr', 'create', '-R', this.repo, '--base', this.mirror.branch, '--head', `${owner}:${branch}`, '--title', `[swarm] ${task.ref}: ${task.title}`, '--body', body]))
      .trim()
      .split('\n')
      .pop();
    return { id: Number(url.split('/').pop()), where: url };
  }

  async submissions() {
    return (await this.#openPrs()).map((pr) => ({ id: pr.number, taskRef: pr.taskRef, worker: pr.worker, head: pr.headRefOid, url: pr.url, mine: pr.worker === this.identity?.id }));
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
    // Leave no branch behind when the submission was pushed to this repository rather than a fork.
    const pr = JSON.parse(await this.gh(['pr', 'view', String(sub.id), '-R', this.repo, '--json', 'headRefName,isCrossRepository']));
    if (!pr.isCrossRepository && pr.headRefName.startsWith('swarm/')) {
      await run('gh', ['api', '-X', 'DELETE', `repos/${this.repo}/git/refs/heads/${pr.headRefName}`]);
    }
    return { where: sub.url };
  }

  /**
   * Maintainers: open an issue for every ready task that has none, close issues of finished
   * tasks. `done` is a Map of project id -> Set of finished task ids.
   */
  async sync(projects, done) {
    const issues = await this.#taskIssues();
    const result = { opened: [], closed: [] };
    for (const project of projects) {
      for (const task of project.tasks) {
        const issue = issues.get(task.ref);
        const finished = done.get(project.id)?.has(task.id);
        if (!issue && !finished && task.status === 'ready') {
          const body = [
            `**${task.title}**  ·  project \`${project.id}\`  ·  size ${task.size}`,
            '',
            `This issue is the log for a Swarm task. The task itself is the file [\`${task.file}\`](../blob/${this.mirror.branch}/${task.file}); agents work from that file, never from this issue or its comments.`,
            '',
            'To work on it with your own Claude Code or Codex plan:',
            '',
            '```',
            `npx github:${this.repo} run --task ${task.ref}`,
            '```',
            '',
            'Claims and releases appear below as signed comments. A pull request is opened only after verification passes on the worker\'s machine.',
          ].join('\n');
          const url = (await this.gh(['issue', 'create', '-R', this.repo, '--title', `[swarm] ${task.ref}: ${task.title}`, '--body', body])).trim().split('\n').pop();
          result.opened.push({ ref: task.ref, url });
        } else if (issue && finished) {
          await this.gh(['issue', 'close', String(issue.number), '-R', this.repo, '--comment', 'Done: a verified submission for this task was merged.']);
          result.closed.push({ ref: task.ref, url: issue.url });
        }
      }
    }
    return result;
  }
}
