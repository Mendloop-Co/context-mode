// Mendloop fork (MENDLOOP.md): the one place that decides whether context-mode may repair or rewrite
// Claude Code's own files (plugin registry, settings.json, global hooks, plugin cache). It may only when
// this package is installed as a Claude Code plugin (its own path is under <config dir>/plugins/cache) and
// CONTEXT_MODE_NO_SELF_HEAL is not "1". Anywhere else every such write is skipped, with one log line.

const PLUGIN_CACHE = /[\/\\]plugins[\/\\]cache[\/\\]/;
let _logged = false;

export function selfHealAllowed(root, env = process.env) {
  if (env.CONTEXT_MODE_NO_SELF_HEAL === "1") return false;
  return typeof root === "string" && PLUGIN_CACHE.test(root);
}

/** One stderr line per process the first time a self-heal is skipped. */
export function selfHealSkipped(why = "not a Claude Code plugin install") {
  if (_logged) return;
  _logged = true;
  try {
    process.stderr.write(`[context-mode] self-heal skipped (${why}; Mendloop fork)\n`);
  } catch { /* stderr closed */ }
}

/** Where hook/debug logs go: CONTEXT_MODE_DIR/logs when set (the deployment's own folder), else the config dir as upstream. */
export function logDir(configDir, env = process.env) {
  const root = env.CONTEXT_MODE_DIR && env.CONTEXT_MODE_DIR.trim();
  return root ? `${root.replace(/[\/]+$/, "")}/logs` : `${configDir}/context-mode`;
}
