// Mendloop fork (MENDLOOP.md): mirror of hooks/self-heal-policy.mjs for the bundled server and CLI. Claude Code's
// own files may be repaired or rewritten only when this package is installed as a Claude Code plugin (its own
// path is under <config dir>/plugins/cache) and CONTEXT_MODE_NO_SELF_HEAL is not "1".
const PLUGIN_CACHE = /[\/\\]plugins[\/\\]cache[\/\\]/;

export function selfHealAllowed(root: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CONTEXT_MODE_NO_SELF_HEAL === "1") return false;
  return PLUGIN_CACHE.test(root);
}

/** The npm registry version check runs only with CONTEXT_MODE_UPDATE_CHECK=1. */
export function updateCheckEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CONTEXT_MODE_UPDATE_CHECK === "1";
}
