export type RolePolicy = {
  roleName: string;
  systemPrompt: string;
  spawnMode: "run" | "session";
  allow?: string[];
  deny?: string[];
};

/** Runtime map: childSessionKey -> RolePolicy */
export const rolePolicyMap = new Map<string, RolePolicy>();

/**
 * Register hooks on the plugin API for role enforcement.
 */
export function registerRolePolicyHooks(api: any): void {
  // Inject role system prompt into child agent
  api.on("before_prompt_build", (event: any, ctx: any) => {
    const policy = rolePolicyMap.get(ctx.sessionKey);
    if (!policy) return;
    return { prependContext: policy.systemPrompt };
  });

  // Block tools not allowed by the role
  api.on("before_tool_call", (event: any, ctx: any) => {
    const policy = rolePolicyMap.get(ctx.sessionKey);
    if (!policy) return;

    const toolName = String(event.toolName).toLowerCase();

    if (policy.allow && policy.allow.length > 0 && !policy.allow.includes(toolName)) {
      return {
        block: true,
        blockReason: `Agent preset "${policy.roleName}" does not allow tool "${event.toolName}"`,
      };
    }

    if (policy.deny && policy.deny.includes(toolName)) {
      return {
        block: true,
        blockReason: `Agent preset "${policy.roleName}" denies tool "${event.toolName}"`,
      };
    }
  });

  // Clean up policy when subagent ends — only for mode=run.
  // mode=session persists across runs, cleaned up on session_end instead.
  api.on("subagent_ended", (event: any) => {
    const key = event.targetSessionKey;
    const policy = rolePolicyMap.get(key);
    if (policy && policy.spawnMode === "run") {
      rolePolicyMap.delete(key);
    }
  });

  // Clean up persistent (mode=session) policies on session end
  api.on("session_end", (event: any) => {
    const key = event.sessionKey;
    if (key) rolePolicyMap.delete(key);
  });
}
