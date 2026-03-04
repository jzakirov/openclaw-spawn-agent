import path from "node:path";
import { registerRolePolicyHooks } from "./src/role-policy.js";
import { createAgentPresetsListToolFactory } from "./src/roles-list-tool.js";
import { createSpawnAgentToolFactory } from "./src/spawn-role-tool.js";

export default function register(api: any) {
  const pluginDir = path.dirname(new URL(import.meta.url).pathname);

  const resolveStateDir = (): string | undefined => {
    try {
      return api.runtime?.state?.resolveStateDir?.();
    } catch {
      return undefined;
    }
  };

  const factoryOpts = { pluginDir, resolveStateDir };

  // Register spawn_agent as a tool factory (receives context per session)
  api.registerTool(createSpawnAgentToolFactory(factoryOpts), { optional: true });

  // Register agent_presets_list as a tool factory
  api.registerTool(createAgentPresetsListToolFactory(factoryOpts), { optional: true });

  // Register policy enforcement hooks
  registerRolePolicyHooks(api);

  api.logger.info("spawn-agent: registered tools and hooks");
}
