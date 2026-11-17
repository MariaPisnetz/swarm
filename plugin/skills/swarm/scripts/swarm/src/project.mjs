// Projects and tasks live in the repository itself, under .swarm/projects/<id>/.
// Only what maintainers have merged to the default branch is ever executed.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, parseFrontmatter } from './util.mjs';

export const SWARM_DIR = '.swarm';

const DEFAULTS = {
  paths: ['**'],
  protect: [],
  verify: [],
  limits: { maxFilesChanged: 40, maxDiffLines: 2000 },
  review: { quorum: 1 },
  replication: 1,
  claimTtlMinutes: 90,
};

// Never writable by a contribution, whatever a project manifest says.
export const ALWAYS_PROTECTED = [
  '.swarm/projects/*/project.json',
  '.swarm/projects/*/tasks/**',
  '.github/**',
  '.swarm/receipts/**',
  '.swarm/reviews/**',
  '.git/**',
  '.gitmodules',
];

export function loadProjects(root) {
  const base = path.join(root, SWARM_DIR, 'projects');
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(base, d.name, 'project.json')))
    .map((d) => loadProject(root, d.name))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function loadProject(root, id) {
  const dir = path.join(root, SWARM_DIR, 'projects', id);
  const manifest = readJson(path.join(dir, 'project.json'));
  const project = {
    ...DEFAULTS,
    ...manifest,
    id,
    limits: { ...DEFAULTS.limits, ...manifest.limits },
    review: { ...DEFAULTS.review, ...manifest.review },
  };
  for (const v of project.verify) {
    if (!v.name || !v.run) throw new Error(`Project ${id}: every verify step needs "name" and "run"`);
  }
  project.tasks = loadTasks(root, project);
  return project;
}

function loadTasks(root, project) {
  const dir = path.join(root, SWARM_DIR, 'projects', project.id, 'tasks');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
      const id = meta.id || path.basename(f, '.md');
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Task id "${id}" must be lowercase letters, digits and dashes`);
      return {
        id,
        ref: `${project.id}/${id}`,
        project: project.id,
        title: meta.title || id,
        status: meta.status || 'ready',
        size: meta.size || 'M',
        paths: meta.paths || project.paths,
        verify: (meta.verify || []).map((v, i) => (typeof v === 'string' ? { name: `task-${i + 1}`, run: v } : v)),
        body,
        file: path.join(SWARM_DIR, 'projects', project.id, 'tasks', f),
      };
    });
}

/** Task ids that already have a merged receipt on this checkout. */
export function completedTasks(root, projectId) {
  const dir = path.join(root, SWARM_DIR, 'receipts', projectId);
  if (!fs.existsSync(dir)) return new Set();
  return new Set(
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.readdirSync(path.join(dir, d.name)).some((f) => f.endsWith('.json')))
      .map((d) => d.name),
  );
}

export function findTask(projects, ref) {
  const [projectId, taskId] = ref.includes('/') ? ref.split('/') : [null, ref];
  for (const p of projects) {
    if (projectId && p.id !== projectId) continue;
    const t = p.tasks.find((x) => x.id === taskId);
    if (t) return { project: p, task: t };
  }
  return null;
}

/** All verify steps that apply to a task: project-wide steps, then the task's own. */
export function verifySteps(project, task) {
  return [...project.verify, ...task.verify];
}

export function protectedGlobs(project) {
  return [...ALWAYS_PROTECTED, ...project.protect];
}

export function receiptPath(projectId, taskId, workerId) {
  return path.posix.join(SWARM_DIR, 'receipts', projectId, taskId, `${workerId}.json`);
}
