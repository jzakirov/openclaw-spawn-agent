import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export type RoleToolPolicy = {
  allow?: string[];
  deny?: string[];
};

export type RoleConfig = {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutSeconds?: number;
  mode?: "run" | "session";
  cleanup?: "delete" | "keep";
  sandbox?: "inherit" | "require";
  tools?: RoleToolPolicy;
  systemPrompt: string;
  /** Where this role was loaded from */
  source: string;
};

function parseRoleFile(content: string, filePath: string): RoleConfig | null {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch {
    return null;
  }

  const meta = parsed.data as Record<string, unknown>;
  const body = parsed.content.trim();
  const name = String(meta.name ?? "").trim();
  if (!name) return null;

  let tools: RoleToolPolicy | undefined;
  if (meta.tools && typeof meta.tools === "object") {
    tools = {};
    const t = meta.tools as Record<string, unknown>;
    if (Array.isArray(t.allow)) tools.allow = t.allow.map((s: unknown) => String(s).toLowerCase());
    if (Array.isArray(t.deny)) tools.deny = t.deny.map((s: unknown) => String(s).toLowerCase());
  }

  return {
    name,
    description: String(meta.description ?? ""),
    model: meta.model ? String(meta.model) : undefined,
    thinking: meta.thinking ? String(meta.thinking) : undefined,
    timeoutSeconds: typeof meta.timeoutSeconds === "number" ? meta.timeoutSeconds : undefined,
    mode: meta.mode === "session" ? "session" : "run",
    cleanup: meta.cleanup === "keep" ? "keep" : "delete",
    sandbox: meta.sandbox === "require" ? "require" : "inherit",
    tools,
    systemPrompt: body,
    source: filePath,
  };
}

async function loadRolesFromDir(dir: string): Promise<Map<string, RoleConfig>> {
  const roles = new Map<string, RoleConfig>();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return roles;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(dir, entry);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const role = parseRoleFile(content, filePath);
      if (role && !roles.has(role.name)) {
        roles.set(role.name, role);
      }
    } catch {
      // Skip unreadable files
    }
  }
  return roles;
}

/** Cache key for loaded roles */
type CacheKey = string;

function makeCacheKey(workspaceDir?: string, stateDir?: string): CacheKey {
  return `${workspaceDir ?? ""}:${stateDir ?? ""}`;
}

const rolesCache = new Map<CacheKey, { roles: Map<string, RoleConfig>; loadedAt: number }>();
const CACHE_TTL_MS = 30_000;

/**
 * Load roles from all discovery tiers (higher priority first).
 * 1. <workspace>/.openclaw/subagents/*.md
 * 2. <stateDir>/subagents/*.md
 * 3. Plugin bundled defaults
 *
 * Results are cached by (workspaceDir, stateDir) for 30s.
 */
export async function loadRoles(opts: {
  workspaceDir?: string;
  stateDir?: string;
  pluginDir: string;
}): Promise<Map<string, RoleConfig>> {
  const key = makeCacheKey(opts.workspaceDir, opts.stateDir);
  const cached = rolesCache.get(key);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.roles;
  }

  const merged = new Map<string, RoleConfig>();

  // Load in reverse priority so higher-priority sources overwrite
  const tiers: string[] = [];

  // Tier 3: Plugin bundled defaults (lowest priority)
  tiers.push(path.join(opts.pluginDir, "subagents"));

  // Tier 2: User state dir
  if (opts.stateDir) {
    tiers.push(path.join(opts.stateDir, "subagents"));
  }

  // Tier 1: Workspace (highest priority)
  if (opts.workspaceDir) {
    tiers.push(path.join(opts.workspaceDir, ".openclaw", "subagents"));
  }

  for (const dir of tiers) {
    const roles = await loadRolesFromDir(dir);
    for (const [name, config] of roles) {
      merged.set(name, config);
    }
  }

  rolesCache.set(key, { roles: merged, loadedAt: Date.now() });
  return merged;
}
