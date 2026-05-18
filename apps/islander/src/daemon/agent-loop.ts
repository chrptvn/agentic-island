import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import OpenAI from "openai";
import { readFileSync, existsSync } from "fs";
import type { IslanderConfig } from "../lib/config.js";
import { soulPath } from "../lib/config.js";
import { updateStatus, insertLog } from "../lib/db.js";

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

const MAX_RETRIES = 5;
const LOOP_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mcpToolsToOpenAI(tools: Awaited<ReturnType<Client["listTools"]>>["tools"]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
    },
  }));
}

export async function runAgentLoop(islanderId: string, config: IslanderConfig): Promise<void> {
  const entry = config.islanders[islanderId];
  if (!entry) throw new Error(`Islander "${islanderId}" not found in config`);

  const soul = existsSync(soulPath(islanderId))
    ? readFileSync(soulPath(islanderId), "utf-8")
    : `You are ${islanderId}, a castaway surviving on an island. Explore, gather resources, and survive.`;

  const openaiClient = new OpenAI({
    baseURL: config.llm.baseURL,
    apiKey: config.llm.apiKey || "no-key",
  });

  const log = (role: string, content: string) => {
    insertLog(islanderId, role, content);
    process.stderr.write(`[${islanderId}][${role}] ${content.slice(0, 120)}\n`);
  };

  // Connect MCP client
  const mcpClient = new Client({ name: "islander", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(entry.mcpURL), {
    requestInit: {
      headers: { Authorization: `Bearer ${entry.passport}` },
    },
  });

  await mcpClient.connect(transport);
  log("system", `Connected to MCP at ${entry.mcpURL}`);

  const toolList = await mcpClient.listTools();
  const openaiTools = mcpToolsToOpenAI(toolList.tools);

  const messages: ChatMessage[] = [{ role: "system", content: soul }];
  let retries = 0;

  const cleanup = async () => {
    try { await mcpClient.close(); } catch { /* ignore */ }
    updateStatus(islanderId, "stopped");
  };

  process.on("SIGTERM", async () => { await cleanup(); process.exit(0); });
  process.on("SIGINT",  async () => { await cleanup(); process.exit(0); });

  while (true) {
    try {
      const response = await openaiClient.chat.completions.create({
        model: config.llm.model,
        messages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        tool_choice: openaiTools.length > 0 ? "auto" : undefined,
      });

      const msg = response.choices[0]?.message;
      if (!msg) {
        await sleep(LOOP_DELAY_MS);
        continue;
      }

      messages.push(msg as ChatMessage);
      retries = 0;

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Execute all tool calls
        for (const tc of msg.tool_calls) {
          const fnName = tc.function.name;
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>; } catch { /* empty args */ }

          log("tool_call", `${fnName}(${JSON.stringify(args).slice(0, 200)})`);

          let toolResult: string;
          try {
            const result = await mcpClient.callTool({ name: fnName, arguments: args });
            const contents = result.content as Array<{ type: string; text?: string }>;
            const text = contents
              .filter((c) => c.type === "text" && typeof c.text === "string")
              .map((c) => c.text as string)
              .join("\n");
            toolResult = text || "(no output)";
          } catch (err) {
            toolResult = `Error: ${String(err)}`;
          }

          log("tool_result", toolResult.slice(0, 500));
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: toolResult,
          });
        }
        // Continue loop immediately after tool calls
        continue;
      }

      // Text-only response
      if (msg.content) {
        log("assistant", msg.content);
      }
      // Wait before next thought cycle
      await sleep(LOOP_DELAY_MS);

    } catch (err) {
      retries++;
      const backoff = Math.min(1000 * Math.pow(2, retries), 30_000);
      log("error", `Loop error (retry ${retries}/${MAX_RETRIES}): ${String(err)}`);
      if (retries >= MAX_RETRIES) {
        log("error", "Max retries reached, stopping.");
        updateStatus(islanderId, "error");
        await cleanup();
        process.exit(1);
      }
      await sleep(backoff);
    }
  }
}
