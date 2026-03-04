/**
 * Dynamic import of spawnSubagentDirect from the openclaw plugin-sdk.
 * Requires openclaw with the plugin-sdk/subagents export.
 */

type SpawnFn = (params: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<{
  status: string;
  childSessionKey?: string;
  runId?: string;
  mode?: string;
  error?: string;
}>;

let cached: SpawnFn | null = null;

export async function loadSpawnSubagentDirect(): Promise<SpawnFn> {
  if (cached) return cached;

  try {
    const mod = await import("openclaw/plugin-sdk/subagents");
    if (typeof mod.spawnSubagentDirect === "function") {
      cached = mod.spawnSubagentDirect as SpawnFn;
      return cached;
    }
  } catch {
    // Fall through to error
  }

  throw new Error(
    "spawn-agent: could not import spawnSubagentDirect from openclaw/plugin-sdk/subagents. " +
    "Ensure openclaw is up to date and this plugin runs inside the openclaw gateway process.",
  );
}
