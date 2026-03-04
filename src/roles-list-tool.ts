import { loadRoles } from "./role-loader.js";

/**
 * Build the agent_presets_list tool factory.
 * Uses ctx.workspaceDir for correct per-session role discovery.
 */
export function createAgentPresetsListToolFactory(opts: {
  pluginDir: string;
  resolveStateDir: () => string | undefined;
}) {
  return async (ctx: any) => {
    const roles = await loadRoles({
      workspaceDir: ctx.workspaceDir,
      stateDir: opts.resolveStateDir(),
      pluginDir: opts.pluginDir,
    });

    return {
      name: "agent_presets_list",
      label: "List Agent Presets",
      description: "List all available subagent presets with their descriptions and configuration.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },

      async execute() {
        const entries = [...roles.entries()].map(([name, role]) => ({
          name,
          description: role.description,
          model: role.model,
          thinking: role.thinking,
          mode: role.mode,
          timeoutSeconds: role.timeoutSeconds,
          tools: role.tools,
          source: role.source,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ agents: entries }, null, 2),
            },
          ],
        };
      },
    };
  };
}
