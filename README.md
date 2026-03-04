# spawn-agent

Declarative subagent presets for [OpenClaw](https://openclaw.dev).

This plugin loads preset definitions from Markdown files with YAML frontmatter and exposes:

- `spawn_agent`: spawn a subagent using a preset + enforce tool policy
- `agent_presets_list`: list discovered presets

## Installation

```bash
openclaw plugins install @jzakirov/spawn-agent
```

Or from a local path (development):

```bash
openclaw plugins install ./openclaw-spawn-agent
```

## Preset discovery

Presets are discovered from multiple tiers (higher priority overrides lower priority):

1. `<workspace>/.openclaw/subagents/*.md`
2. `<stateDir>/subagents/*.md`
3. Plugin defaults: `subagents/*.md`

## Preset format

Each preset is a `.md` file with YAML frontmatter + a Markdown body used as the subagent system prompt.

Example:

```md
---
name: reviewer
description: Read-only code reviewer focusing on bugs, security, and maintainability
model: anthropic/claude-sonnet-4-20250514
thinking: high
timeoutSeconds: 120
mode: run
cleanup: delete
sandbox: inherit
tools:
  allow: [read, diffs, grep, glob]
  deny: [exec, write, edit, apply_patch]
---

You are a code reviewer. Be concise. Focus on bugs, security, and maintainability.
```

Supported frontmatter fields:

| Field            | Type                    | Default    | Notes |
|-----------------|-------------------------|------------|------|
| `name`          | string                  | —          | Required. Unique key used by `spawn_agent`. |
| `description`   | string                  | `""`       | Shown in tool descriptions/listing. |
| `model`         | string                  | —          | Passed through to OpenClaw subagent spawn. |
| `thinking`      | string                  | —          | Passed through to OpenClaw subagent spawn. |
| `timeoutSeconds`| number                  | —          | Passed through as `runTimeoutSeconds`. |
| `mode`          | `run` \| `session`      | `run`      | `session` keeps a persistent session. |
| `cleanup`       | `delete` \| `keep`      | `delete`   | Cleanup behavior for `run` mode. |
| `sandbox`       | `inherit` \| `require`  | `inherit`  | Whether to require sandboxing. |
| `tools.allow`   | string[]                | —          | If set, only these tools are allowed. |
| `tools.deny`    | string[]                | —          | Tools to deny (even if allowed). |

## Tool: `spawn_agent`

Parameters:

- `agent` (string, required): preset name
- `task` (string, required): instruction for the subagent
- `label` (string, optional): human-readable label
- `thread` (boolean, optional): bind to a thread
- `mode` (`run` \| `session`, optional): override preset mode

Response includes `childSessionKey`, `runId`, and where the preset was resolved from.

## Tool: `agent_presets_list`

Returns all discovered presets and their metadata, including `source`.

## License

MIT

