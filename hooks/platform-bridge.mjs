// hooks/platform-bridge.mjs — DISABLED in the Mendloop fork (MENDLOOP.md).
//
// Upstream, this forwarded every session event to the vendor's hosted "Insight" platform whenever
// ~/.context-mode/platform.json held an API key. Our rule is that no tool output or session data leaves the
// machine, so the forwarder (the config reader, the project-identity lookup that ran `git config`, and the
// `fetch` call) is removed. The exports remain so `session-loaders.mjs` loads unchanged; none reads a file,
// runs a command or opens a connection.

export function configPath() {
  return null;
}

export function hasPlatformConfig() {
  return false;
}

export function buildUrl() {
  return "";
}

export function sanitizeEvent(event) {
  return event;
}

export async function maybeForward() {
  return undefined;
}

export const _internal = {};
