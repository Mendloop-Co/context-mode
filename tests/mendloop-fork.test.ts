/**
 * Mendloop fork (MENDLOOP.md): the rules our deployment needs, each as a test.
 * 1. Claude Code's own files are rewritten only for a Claude Code plugin install.
 * 2. Starting the server from a non-plugin install writes nothing to the Claude config dir.
 * 3. No outbound call at boot (npm version check off unless CONTEXT_MODE_UPDATE_CHECK=1).
 * 4. The hosted Insight forwarder and ctx_insight are gone.
 */
import { describe, test, expect } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { selfHealAllowed, updateCheckEnabled } from "../src/util/self-heal-policy.js";
// @ts-expect-error plain .mjs, no types
import * as policy from "../hooks/self-heal-policy.mjs";
// @ts-expect-error plain .mjs, no types
import * as bridge from "../hooks/platform-bridge.mjs";

const ROOT = resolve(__dirname, "..");
const CACHE = "/Users/x/.claude/plugins/cache/context-mode/context-mode/1.0.169";

describe("self-heal policy", () => {
  for (const [name, allowed] of [
    ["ts", selfHealAllowed],
    ["mjs", policy.selfHealAllowed],
  ] as const) {
    test(`${name}: only a plugin-cache path may self-heal`, () => {
      expect(allowed(CACHE, {})).toBe(true);
      expect(allowed("C:\\Users\\x\\.claude\\plugins\\cache\\a\\b\\1.0.0", {})).toBe(true);
      expect(allowed("/Users/x/work/ctx/node_modules/context-mode", {})).toBe(false);
      expect(allowed("/Users/x/.claude/plugins/marketplaces/context-mode", {})).toBe(false);
      expect(allowed(ROOT, {})).toBe(false);
    });
    test(`${name}: CONTEXT_MODE_NO_SELF_HEAL=1 is a hard off`, () => {
      expect(allowed(CACHE, { CONTEXT_MODE_NO_SELF_HEAL: "1" })).toBe(false);
      expect(allowed(CACHE, { CONTEXT_MODE_NO_SELF_HEAL: "0" })).toBe(true);
    });
  }
  test("the update check needs CONTEXT_MODE_UPDATE_CHECK=1", () => {
    expect(updateCheckEnabled({})).toBe(false);
    expect(updateCheckEnabled({ CONTEXT_MODE_UPDATE_CHECK: "1" })).toBe(true);
  });
  test("logs go under CONTEXT_MODE_DIR when it is set", () => {
    expect(policy.logDir("/c", { CONTEXT_MODE_DIR: "/data/" })).toBe("/data/logs");
    expect(policy.logDir("/c", {})).toBe("/c/context-mode");
  });
});

describe("hosted forwarder", () => {
  test("is disabled: a platform.json with a key is never read and nothing is sent", async () => {
    const home = mkdtempSync(join(tmpdir(), "cm-fork-"));
    mkdirSync(join(home, ".context-mode"));
    writeFileSync(
      join(home, ".context-mode", "platform.json"),
      JSON.stringify({ api_key: "ctxm_test", platform_url: "https://example.invalid" }),
    );
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as typeof fetch;
    process.env.HOME = home;
    try {
      expect(bridge.hasPlatformConfig()).toBe(false);
      expect(await bridge.maybeForward({ type: "x", projectDir: home }, "claude-code")).toBeUndefined();
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(readFileSync(resolve(ROOT, "hooks/platform-bridge.mjs"), "utf8")).not.toMatch(/fetch\(|execSync|readFileSync/);
  });
});

describe("hooks from a non-plugin install", () => {
  test("every hook leaves the Claude config dir empty", () => {
    const cfg = mkdtempSync(join(tmpdir(), "cm-fork-hooks-"));
    const data = mkdtempSync(join(tmpdir(), "cm-fork-hookdata-"));
    const input = JSON.stringify({ session_id: "s-fork", cwd: data, tool_name: "Bash", tool_input: { command: "ls" }, tool_response: "x", prompt: "hi", source: "startup" });
    for (const hook of ["sessionstart", "pretooluse", "posttooluse", "userpromptsubmit", "stop", "precompact"]) {
      const r = spawnSync("node", [resolve(ROOT, "hooks", `${hook}.mjs`)], {
        input, encoding: "utf8", cwd: data,
        env: { ...process.env, CLAUDE_CONFIG_DIR: cfg, CONTEXT_MODE_DIR: data, CLAUDE_PROJECT_DIR: data },
      });
      expect(r.status, hook).toBe(0);
    }
    expect(readdirSync(cfg)).toEqual([]);
  }, 60000);
});

describe("start.mjs from a non-plugin install", () => {
  test("writes nothing to the Claude config dir, says so once, and exposes no ctx_insight", async () => {
    const cfg = mkdtempSync(join(tmpdir(), "cm-fork-cfg-"));
    const data = mkdtempSync(join(tmpdir(), "cm-fork-data-"));
    const child = spawn("node", [resolve(ROOT, "start.mjs")], {
      cwd: data,
      env: { ...process.env, CLAUDE_CONFIG_DIR: cfg, CONTEXT_MODE_DIR: data, CLAUDE_PROJECT_DIR: data, VITEST: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const send = (m: object) => child.stdin.write(JSON.stringify(m) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "claude-code", version: "1" } } });
    await new Promise((r) => setTimeout(r, 4000));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    await new Promise((r) => setTimeout(r, 3000));
    child.kill();
    expect(readdirSync(cfg)).toEqual([]); // no hooks/, settings.json, plugins/ or context-mode/ log
    expect(err.match(/self-heal skipped/g)?.length).toBe(1);
    const tools = out.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((m) => m.id === 2)?.result?.tools ?? [];
    const names = tools.map((t: { name: string }) => t.name);
    expect(names).toContain("ctx_execute");
    expect(names).not.toContain("ctx_insight");
  }, 30000);
});

describe("sessionstart gate", () => {
  test("a plugin-cache path still allows the heal (the gate is not a blanket off)", async () => {
    const { selfHealAllowed } = policy;
    expect(selfHealAllowed("/Users/x/.claude/plugins/cache/context-mode/context-mode/1.0.169/hooks/..")).toBe(true);
  });
});
