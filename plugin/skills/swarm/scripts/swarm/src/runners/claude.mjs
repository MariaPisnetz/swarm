// Runs the official Claude Code CLI headlessly, under the volunteer's own login.
//
// The agent is deliberately boxed in:
//   --restricted            no Bash or other code-running tools, no WebFetch, file tools confined
//                           to the work directory, user/project settings ignored
//   --tools                 only read/search/edit tools are offered at all
//   --strict-mcp-config     no MCP servers
//   disableAllHooks         a repository cannot make the CLI run hook commands
//   --max-budget-usd        hard cap per task
// Swarm, not the agent, runs the project's verify commands, inside the sandbox.
import { run } from '../util.mjs';

export const name = 'claude';
const EDIT_TOOLS = 'Read,Edit,Write,Glob,Grep';
const READ_TOOLS = 'Read,Glob,Grep';

export function buildArgs({ model, budgetUsd, effort, readOnly = false, tools }) {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--restricted',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--settings', '{"disableAllHooks":true}',
    '--permission-mode', readOnly ? 'default' : 'acceptEdits',
    '--tools', tools ?? (readOnly ? READ_TOOLS : EDIT_TOOLS),
  ];
  if (budgetUsd) args.push('--max-budget-usd', String(budgetUsd));
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  return args;
}

/** Parse the stream-json output into a normalized result. Exported for tests. */
export function parseStream(stdout) {
  const out = { ok: false, model: null, version: null, summary: '', rateLimit: null, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, turns: 0, durationMs: 0 } };
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.type === 'system' && ev.subtype === 'init') {
      out.model = ev.model;
      out.version = ev.claude_code_version;
    } else if (ev.type === 'rate_limit_event' && ev.rate_limit_info) {
      out.rateLimit = normalizeRateLimit(ev.rate_limit_info);
    } else if (ev.type === 'result') {
      const u = ev.usage || {};
      out.ok = !ev.is_error && ev.subtype !== 'error_max_budget_usd';
      out.error = out.ok ? undefined : ev.subtype || ev.terminal_reason || 'agent reported an error';
      out.summary = typeof ev.result === 'string' ? ev.result : '';
      out.usage = {
        inputTokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
        outputTokens: u.output_tokens || 0,
        costUsd: ev.total_cost_usd || 0,
        turns: ev.num_turns || 0,
        durationMs: ev.duration_ms || 0,
      };
    }
  }
  return out;
}

export function normalizeRateLimit(info) {
  const win = (w) => (w ? { utilization: w.utilization ?? null, resetsAt: w.resetsAt ? new Date(w.resetsAt * 1000).toISOString() : null, status: w.status } : null);
  return {
    status: info.status,
    fiveHour: win(info.unifiedWindows?.five_hour),
    weekly: win(info.unifiedWindows?.seven_day),
  };
}

export async function runAgent({ cwd, prompt, model, budgetUsd, effort, timeoutMs, readOnly }) {
  const res = await run('claude', buildArgs({ model, budgetUsd, effort, readOnly }), { cwd, input: prompt, timeoutMs, maxBuffer: 256 * 1024 * 1024 });
  const parsed = parseStream(res.stdout);
  if (res.timedOut) return { ...parsed, ok: false, error: 'agent timed out' };
  if (!parsed.ok && !parsed.error) parsed.error = (res.stderr || res.stdout).trim().split('\n').slice(-3).join(' ') || `claude exited ${res.code}`;
  return { ...parsed, runner: name };
}

/** One tiny request to read the account's current rate-limit windows. */
export async function probeQuota() {
  const res = await run('claude', buildArgs({ model: 'haiku', budgetUsd: 0.05, tools: '' }), { input: 'Reply with: ok', timeoutMs: 60_000 });
  return parseStream(res.stdout).rateLimit;
}
