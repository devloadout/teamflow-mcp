# teamflow-mcp

**Connect your AI agent to Notion, Slack, and Jira** — the turnkey connector that Zapier never
shipped. An [MCP](https://modelcontextprotocol.io) server that lets Claude, Cursor, and other MCP
clients read and write across your team tools.

No hosting, no webhooks to maintain. Runs locally over stdio. Each integration turns on only if you
provide its credentials, so configure just the services you use.

## Tools

| Service | Tools |
|--------|-------|
| **Notion** | `notion_search`, `notion_create_page` |
| **Slack** | `slack_list_channels`, `slack_post_message` |
| **Jira** | `jira_search`, `jira_create_issue` |

## Install

No global install needed — your MCP client runs it via `npx`. Use either source:

- **From GitHub (works today):** set `args` to `["-y", "github:devloadout/teamflow-mcp"]`
- **From npm (once published):** set `args` to `["-y", "teamflow-mcp"]`

The examples below show the npm form; swap in the GitHub form if you prefer.

### Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "teamflow": {
      "command": "npx",
      "args": ["-y", "teamflow-mcp"],
      "env": {
        "NOTION_TOKEN": "secret_xxx",
        "SLACK_BOT_TOKEN": "xoxb-xxx",
        "JIRA_BASE_URL": "https://your-org.atlassian.net",
        "JIRA_EMAIL": "you@example.com",
        "JIRA_API_TOKEN": "xxx"
      }
    }
  }
}
```

### Cursor

In `~/.cursor/mcp.json` (or Settings → MCP), use the same `command` / `args` / `env` block.

You only need the env vars for the services you want. Omit the rest and those tools simply won't load.

## Getting tokens

- **Notion** — create an internal integration at https://www.notion.so/my-integrations, copy the
  token, and "Connect" it to the pages/databases you want it to access.
- **Slack** — create an app at https://api.slack.com/apps, add bot scopes
  (`channels:read`, `chat:write`), install it, and copy the **Bot User OAuth Token** (`xoxb-…`).
- **Jira** — create an API token at https://id.atlassian.com/manage-profile/security/api-tokens.

## Example prompts

- "Search Notion for the Q3 roadmap and summarize it."
- "Post the release notes to #engineering on Slack."
- "Create a Jira bug in project APP: login button unresponsive on Safari."

---

Built by [DevLoadout](https://github.com/devloadout). Want sharper AI-agent setups? See the
[Agentic Coding Starter Kit](https://alphaletgo.gumroad.com/l/agentic-coding-kit).

## License

MIT.
