# MENDLOOP.md: the Mendloop fork of context-mode

Fork of [mksglu/context-mode](https://github.com/mksglu/context-mode) at **v1.0.169, upstream commit `fc0fda3d`**
(branch `mendloop`). It is used by team macmini's session `Dev2` as an experiment (Mendloop issue #1892). The
upstream licence (Elastic License 2.0), its `LICENSE` file and its notices are untouched.

## Why the fork

Our rules for any tool that runs inside an agent session:

1. **Nothing outside the session's own home.** A tool never writes to Claude Code's user-level files
   (`~/.claude/settings.json`, hooks, plugin registry) or to another session's folders.
2. **No outbound data.** Nothing a session reads or writes leaves the machine, and no call is made that was not asked for.
3. **Claude settings are the owner's.** Only the owner's explicit yes may change them; a tool never does it by itself.

Upstream breaks them in four ways, found by reading the code and confirmed in a preflight (the first server start
wrote a global SessionStart hook and `enabledPlugins` into `~/.claude/settings.json`).

## The changes (each small; tests in `tests/mendloop-fork.test.ts`)

| # | Upstream behaviour | Fork behaviour | Where |
|---|---|---|---|
| 1 | `start.mjs`, `hooks/pretooluse.mjs`, `hooks/sessionstart.mjs`, `hooks/ensure-deps.mjs`, `scripts/postinstall.mjs` and the server (`healCacheMidSession`) repair the plugin registry, `settings.json` `enabledPlugins`, deploy a global SessionStart hook, normalize `hooks.json`/`plugin.json`, sweep stale `.mcp.json`, rewrite shell snapshots, and run `npm install` at boot. | All of it runs **only when the package is installed as a Claude Code plugin** (its own path is under `<config dir>/plugins/cache`) **and** `CONTEXT_MODE_NO_SELF_HEAL` is not `1` (a hard off). Otherwise each is skipped, with one stderr line (`self-heal skipped`). | `hooks/self-heal-policy.mjs` (new), `src/util/self-heal-policy.ts` (new, same rule), `start.mjs`, `hooks/pretooluse.mjs`, `hooks/sessionstart.mjs`, `hooks/ensure-deps.mjs`, `scripts/postinstall.mjs` (`isGlobalInstall`), `src/server.ts` |
| 2 | Hook error and debug logs are written to `<config dir>/context-mode/`. `ctx_upgrade` and `context-mode upgrade` rewrite Claude's hooks and settings. | Logs go to `$CONTEXT_MODE_DIR/logs` when `CONTEXT_MODE_DIR` is set. `ctx_upgrade` and `upgrade` refuse unless it is a plugin install. | `logDir()` in the policy module, `hooks/run-hook.mjs`, `hooks/precompact.mjs`, `hooks/sessionstart.mjs`, `src/server.ts`, `src/cli.ts` |
| 3 | The server asks `registry.npmjs.org/context-mode/latest` at boot (and `upgrade` does). | Off unless `CONTEXT_MODE_UPDATE_CHECK=1`. | `src/server.ts`, `src/cli.ts` |
| 4 | `hooks/platform-bridge.mjs` POSTs every session event to the vendor's hosted "Insight" platform when `~/.context-mode/platform.json` holds a key; `ctx_insight` / `context-mode insight` open that dashboard. | The forwarder is removed (the exports stay as no-ops; no file read, no command, no `fetch`). `ctx_insight`, its OpenClaw entry and `context-mode insight` are removed. | `hooks/platform-bridge.mjs`, `src/server.ts`, `src/cli.ts`, `src/adapters/openclaw/mcp-tools.ts` |

`server.bundle.mjs` and `cli.bundle.mjs` are rebuilt with upstream's own `npm run build` (the other hook bundles are
byte-identical to upstream's).

## Tests

**How to test:** run every context-mode code path, its test suites included, with `HOME` and `CLAUDE_CONFIG_DIR` pointed at a
throwaway temp folder and `CONTEXT_MODE_DIR` unset: `env -u CONTEXT_MODE_DIR HOME=$(mktemp -d) CLAUDE_CONFIG_DIR=$(mktemp -d) npx vitest run`.
Upstream's own suites write into `~/.claude` when run against the real `HOME` (they re-created the traces we had just removed).

`npx vitest run` with a clean environment (`env -u CONTEXT_MODE_DIR`): **207 files, 4678 tests passed, 28 skipped.**
Changed upstream tests: the tool counts (11 to 10) and lists in `tests/core/server.test.ts`, `tests/plugins/openclaw.test.ts`,
`tests/opencode-plugin.test.ts`, `tests/adapters/antigravity.test.ts`; the `ctx_insight` description tests removed; the
`doctor` source tests end their search at `async function upgrade` (the removed `insight` function was their marker);
`tests/util/postinstall-heal.test.ts` stages its package under a `plugins/cache` path (the only place self-heal is
allowed); `tests/hooks/run-hook.test.ts` clears `CONTEXT_MODE_DIR` from the child env. Removed with the forwarder they
exercised: `tests/hooks/platform-bridge-wire.test.ts`, `tests/integration/seed-parity-coverage.test.ts`,
`tests/integration/cross-project-attribution.test.ts`, `tests/integration/commit-message-symmetry.test.ts`.

## Audit of file writes (`start.mjs`, `hooks/`, `scripts/`)

- **Gated by change 1** (writes under `<config dir>`): the registry, `settings.json`, `hooks/context-mode-cache-heal.mjs`,
  plugin-cache `hooks.json` / `plugin.json` / `.mcp.json`, `shell-snapshots/`, plugin-cache version dirs, and the
  `npm install` calls from `start.mjs` and `ensureDeps`.
- **Allowed, inside the project or `CONTEXT_MODE_DIR`:** the session and content SQLite files, session events, stats.
- **Allowed, short-lived in `$TMPDIR`:** guidance, latency and rejection markers, MCP-ready sentinels, the codex capability cache.
- **Package-local:** `hooks/ensure-deps.mjs` `ensureNativeCompat` and `scripts/heal-better-sqlite3.mjs` swap or rebuild the
  native `better-sqlite3` binary inside the package's own `node_modules` (offline from a hook; the install itself uses the network).
- **Explicit commands only, never run by the server or a hook, not used by us:** `scripts/version-sync.mjs` (a maintainer
  script), `scripts/lib/register-openclaw-config.mjs` and `install-openclaw-plugin.sh` (the OpenClaw installer, which edits
  OpenClaw's config), and the CLI commands for other agents' adapters.
- **Known limit:** the session database's default folder (when `CONTEXT_MODE_DIR` is unset) is still
  `<config dir>/context-mode/`. Deployments set `CONTEXT_MODE_DIR` to a folder inside their own home.
- **Not changed (and why):** `ctx_execute*` still run arbitrary code with the user's file and network access (upstream says it
  is not a full OS sandbox), and `ctx_fetch_and_index` fetches URLs the model chooses. Deployments deny the second in their
  permission rules and decide the first themselves.

## Use

Install with nested dependencies from the pinned commit, point `.mcp.json` at `server.bundle.mjs` (not `start.mjs`),
and set `CONTEXT_MODE_DIR`, `CLAUDE_PROJECT_DIR` and `CONTEXT_MODE_PROJECT_DIR` inside the home folder:

```bash
npm install --prefix <home>/ctx --install-strategy=nested --save-exact git+https://github.com/claudeagent-mendloop/context-mode.git#<sha>
```
