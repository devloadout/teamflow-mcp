#!/usr/bin/env node
// teamflow-mcp — connect AI agents to Notion, Slack, and Jira over MCP.
// Each integration activates only if its credentials are present in the environment,
// so you can configure just the services you use.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const {
  NOTION_TOKEN,
  SLACK_BOT_TOKEN,
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN
} = process.env;

const ok = (text) => ({ content: [{ type: "text", text }] });
const fail = (text) => ({ content: [{ type: "text", text }], isError: true });

async function httpJson(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.text();
  let data;
  try { data = JSON.parse(body); } catch { data = body; }
  if (!res.ok) {
    const msg = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`HTTP ${res.status}: ${msg.slice(0, 500)}`);
  }
  return data;
}

const server = new McpServer({ name: "teamflow-mcp", version: "0.1.0" });

/* ----------------------------- Notion ----------------------------- */
if (NOTION_TOKEN) {
  const nh = {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  };

  server.tool(
    "notion_search",
    "Search Notion pages and databases by text. Returns matching titles and IDs.",
    { query: z.string().describe("Text to search for"), page_size: z.number().int().min(1).max(50).optional() },
    async ({ query, page_size = 10 }) => {
      try {
        const data = await httpJson("https://api.notion.com/v1/search", {
          method: "POST", headers: nh,
          body: JSON.stringify({ query, page_size })
        });
        const items = (data.results || []).map((r) => {
          const title =
            r.properties?.title?.title?.[0]?.plain_text ||
            r.properties?.Name?.title?.[0]?.plain_text ||
            Object.values(r.properties || {}).flatMap((p) => p?.title || []).map((t) => t.plain_text).join("") ||
            "(untitled)";
          return `- ${title} [${r.object}] id=${r.id}`;
        });
        return ok(items.length ? items.join("\n") : "No results.");
      } catch (e) { return fail(`notion_search failed: ${e.message}`); }
    }
  );

  server.tool(
    "notion_create_page",
    "Create a new Notion page under a parent page, with a title and markdown-ish text body.",
    {
      parent_page_id: z.string().describe("ID of the parent page"),
      title: z.string(),
      content: z.string().optional().describe("Body text; each line becomes a paragraph")
    },
    async ({ parent_page_id, title, content = "" }) => {
      try {
        const children = content
          ? content.split("\n").filter(Boolean).map((line) => ({
              object: "block", type: "paragraph",
              paragraph: { rich_text: [{ type: "text", text: { content: line } }] }
            }))
          : [];
        const data = await httpJson("https://api.notion.com/v1/pages", {
          method: "POST", headers: nh,
          body: JSON.stringify({
            parent: { page_id: parent_page_id },
            properties: { title: { title: [{ text: { content: title } }] } },
            children
          })
        });
        return ok(`Created page "${title}" id=${data.id}`);
      } catch (e) { return fail(`notion_create_page failed: ${e.message}`); }
    }
  );
}

/* ----------------------------- Slack ----------------------------- */
if (SLACK_BOT_TOKEN) {
  const sh = { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json; charset=utf-8" };
  const checkSlack = (d) => { if (!d.ok) throw new Error(d.error || "slack error"); return d; };

  server.tool(
    "slack_list_channels",
    "List Slack channels the bot can see (id + name).",
    { limit: z.number().int().min(1).max(200).optional() },
    async ({ limit = 100 }) => {
      try {
        const d = checkSlack(await httpJson(`https://slack.com/api/conversations.list?limit=${limit}&exclude_archived=true`, { headers: sh }));
        return ok((d.channels || []).map((c) => `#${c.name} id=${c.id}`).join("\n") || "No channels.");
      } catch (e) { return fail(`slack_list_channels failed: ${e.message}`); }
    }
  );

  server.tool(
    "slack_post_message",
    "Post a message to a Slack channel (by channel id or #name).",
    { channel: z.string(), text: z.string() },
    async ({ channel, text }) => {
      try {
        const d = checkSlack(await httpJson("https://slack.com/api/chat.postMessage", {
          method: "POST", headers: sh, body: JSON.stringify({ channel, text })
        }));
        return ok(`Posted to ${channel} (ts=${d.ts}).`);
      } catch (e) { return fail(`slack_post_message failed: ${e.message}`); }
    }
  );
}

/* ----------------------------- Jira ----------------------------- */
if (JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN) {
  const base = JIRA_BASE_URL.replace(/\/$/, "");
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  const jh = { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" };

  server.tool(
    "jira_search",
    "Search Jira issues with a JQL query. Returns key + summary.",
    { jql: z.string().describe('e.g. project = ABC AND status = "To Do"'), max: z.number().int().min(1).max(50).optional() },
    async ({ jql, max = 20 }) => {
      try {
        const d = await httpJson(`${base}/rest/api/3/search`, {
          method: "POST", headers: jh, body: JSON.stringify({ jql, maxResults: max, fields: ["summary", "status"] })
        });
        return ok((d.issues || []).map((i) => `${i.key}: ${i.fields?.summary} [${i.fields?.status?.name}]`).join("\n") || "No issues.");
      } catch (e) { return fail(`jira_search failed: ${e.message}`); }
    }
  );

  server.tool(
    "jira_create_issue",
    "Create a Jira issue in a project.",
    {
      project_key: z.string(),
      summary: z.string(),
      description: z.string().optional(),
      issue_type: z.string().optional().describe('e.g. "Task", "Bug" (default Task)')
    },
    async ({ project_key, summary, description = "", issue_type = "Task" }) => {
      try {
        const d = await httpJson(`${base}/rest/api/3/issue`, {
          method: "POST", headers: jh,
          body: JSON.stringify({
            fields: {
              project: { key: project_key },
              summary,
              issuetype: { name: issue_type },
              description: {
                type: "doc", version: 1,
                content: [{ type: "paragraph", content: [{ type: "text", text: description || summary }] }]
              }
            }
          })
        });
        return ok(`Created ${d.key}.`);
      } catch (e) { return fail(`jira_create_issue failed: ${e.message}`); }
    }
  );
}

const enabled = [
  NOTION_TOKEN && "Notion",
  SLACK_BOT_TOKEN && "Slack",
  (JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN) && "Jira"
].filter(Boolean);

const transport = new StdioServerTransport();
await server.connect(transport);
// Log to stderr (stdout is the MCP channel).
console.error(`teamflow-mcp running. Enabled: ${enabled.length ? enabled.join(", ") : "none — set NOTION_TOKEN / SLACK_BOT_TOKEN / JIRA_* env vars"}.`);
