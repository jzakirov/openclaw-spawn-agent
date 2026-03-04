import { loadRoles } from "./role-loader.js";
import { rolePolicyMap } from "./role-policy.js";
import { loadSpawnSubagentDirect } from "./spawn-subagent.js";

/**
 * Build the spawn_agent tool factory.
 * Returns a factory function that receives context per-session and produces the tool.
 * Roles are loaded per-context using ctx.workspaceDir for correct workspace discovery.
 */
export function createSpawnAgentToolFactory(opts: {
  pluginDir: string;
  resolveStateDir: () => string | undefined;
}) {
  return async (ctx: any) => {
    const roles = await loadRoles({
      workspaceDir: ctx.workspaceDir,
      stateDir: opts.resolveStateDir(),
      pluginDir: opts.pluginDir,
    });

    if (roles.size === 0) return null;

    const roleNames = [...roles.keys()];
    const roleDescriptions = roleNames
      .map((name) => {
        const r = roles.get(name)!;
        return `- **${name}**: ${r.description}`;
      })
      .join("\n");

    return {
      name: "spawn_agent",
      label: "Spawn Agent",
      description:
        `Spawn a subagent with a predefined preset. Available agents:\n${roleDescriptions}`,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          agent: {
            type: "string",
            enum: roleNames,
            description: "The agent preset to spawn",
          },
          task: {
            type: "string",
            description: "The task instruction for the subagent",
          },
          label: {
            type: "string",
            description: "Optional human-readable label for the spawned session",
          },
          thread: {
            type: "boolean",
            description: "Whether to bind the subagent to a thread",
          },
          mode: {
            type: "string",
            enum: ["run", "session"],
            description: "Override the preset's default mode",
          },
        },
        required: ["agent", "task"],
      },

      async execute(_id: string, params: Record<string, unknown>) {
        const agentName = String(params.agent ?? "").trim();
        const task = String(params.task ?? "").trim();

        if (!agentName || !roles.has(agentName)) {
          const available = roleNames.join(", ");
          return errorResult(`Unknown agent "${agentName}". Available: ${available}`);
        }

        if (!task) {
          return errorResult("task is required");
        }

        const role = roles.get(agentName)!;
        const spawnMode = (params.mode as string) ?? role.mode ?? "run";

        const spawnSubagentDirect = await loadSpawnSubagentDirect();

        const spawnParams: Record<string, unknown> = {
          task,
          label: params.label ?? `${agentName}: ${task.slice(0, 60)}`,
          expectsCompletionMessage: true,
          mode: spawnMode,
          cleanup: role.cleanup ?? "delete",
          sandbox: role.sandbox ?? "inherit",
        };

        if (role.model) spawnParams.model = role.model;
        if (role.thinking) spawnParams.thinking = role.thinking;
        if (role.timeoutSeconds) spawnParams.runTimeoutSeconds = role.timeoutSeconds;
        if (params.thread != null) spawnParams.thread = params.thread;

        const spawnCtx: Record<string, unknown> = {
          agentSessionKey: ctx.sessionKey,
          agentChannel: ctx.messageChannel,
          agentAccountId: ctx.agentAccountId,
          sandboxed: ctx.sandboxed,
        };

        const result = await spawnSubagentDirect(spawnParams, spawnCtx);

        if (result.status !== "accepted") {
          return errorResult(result.error ?? `Spawn failed: ${result.status}`);
        }

        // Register policy for the child session.
        // Safe timing: spawnSubagentDirect enqueues the child asynchronously
        // on the gateway work queue. The child won't start its first LLM turn
        // (and therefore won't hit before_prompt_build / before_tool_call)
        // until the gateway dequeues it, which happens after we return.
        if (result.childSessionKey) {
          rolePolicyMap.set(result.childSessionKey, {
            roleName: agentName,
            systemPrompt: role.systemPrompt,
            spawnMode: spawnMode as "run" | "session",
            allow: role.tools?.allow,
            deny: role.tools?.deny,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: result.status,
                  childSessionKey: result.childSessionKey,
                  runId: result.runId,
                  agent: agentName,
                  resolvedFrom: role.source,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    };
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}
