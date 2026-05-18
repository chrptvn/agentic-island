import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import OpenAI from "openai";
import { readFileSync, existsSync } from "fs";
import type { IslanderConfig } from "../lib/config.js";
import { soulPath } from "../lib/config.js";
import { updateStatus, insertLog } from "../lib/db.js";

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;
type AgentState = "define_goal" | "act" | "evaluate_goal";

const MAX_RETRIES = 5;
const MAX_ACTIONS_PER_GOAL = 15; // safety cap before forcing a new goal
const ACTION_DELAY_MS = 1500;    // brief pause after each action cycle

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

async function callMcp(mcpClient: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await mcpClient.callTool({ name, arguments: args });
  const contents = result.content as Array<{ type: string; text?: string }>;
  return contents
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n") || "(no output)";
}

export async function runAgentLoop(islanderId: string, config: IslanderConfig): Promise<void> {
  const entry = config.islanders[islanderId];
  if (!entry) throw new Error(`Islander "${islanderId}" not found in config`);

  const soul = existsSync(soulPath(islanderId))
    ? readFileSync(soulPath(islanderId), "utf-8")
    : `You are ${islanderId}, a castaway surviving on an island. Explore, gather resources, and survive.`;

  const llm = new OpenAI({
    baseURL: config.llm.baseURL,
    apiKey: config.llm.apiKey || "no-key",
  });

  const log = (role: string, content: string) => {
    insertLog(islanderId, role, content);
    process.stderr.write(`[${islanderId}][${role}] ${content.slice(0, 140)}\n`);
  };

  // ── MCP connection ────────────────────────────────────────────────────────
  const mcpClient = new Client({ name: "islander", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(entry.mcpURL), {
    requestInit: { headers: { Authorization: `Bearer ${entry.passport}` } },
  });
  await mcpClient.connect(transport);
  log("system", `Connected to MCP at ${entry.mcpURL}`);

  const toolList = await mcpClient.listTools();
  const allTools = mcpToolsToOpenAI(toolList.tools);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = async () => {
    // Say farewell before disconnecting (non-fatal)
    try { await callMcp(mcpClient, "say", { message: "Leaving the island for now…" }); } catch { /* ignore */ }
    // Explicitly terminate session so the server triggers island.disconnect()
    try { await transport.terminateSession(); } catch { /* ignore */ }
    try { await mcpClient.close(); } catch { /* ignore */ }
    updateStatus(islanderId, "stopped");
  };
  process.on("SIGTERM", async () => { await cleanup(); process.exit(0); });
  process.on("SIGINT",  async () => { await cleanup(); process.exit(0); });

  // ── State ─────────────────────────────────────────────────────────────────
  let state: AgentState = "define_goal";
  let currentGoal: string | null = null;
  let actionsThisCycle = 0;
  let retries = 0;

  // Per-goal conversation context (reset each goal cycle for token efficiency)
  let messages: ChatMessage[] = [{ role: "system", content: soul }];

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Ask the LLM, append exchange to messages, return the assistant message. */
  async function chat(
    extra: ChatMessage[],
    tools?: OpenAI.Chat.ChatCompletionTool[],
    toolChoice?: OpenAI.Chat.ChatCompletionToolChoiceOption,
  ): Promise<OpenAI.Chat.ChatCompletionMessage> {
    const response = await llm.chat.completions.create({
      model: config.llm.model,
      messages: [...messages, ...extra],
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: toolChoice,
    });
    const msg = response.choices[0]?.message;
    if (!msg) throw new Error("LLM returned empty response");
    // Append the extra turns + assistant reply to context
    for (const m of extra) messages.push(m);
    messages.push(msg as ChatMessage);
    return msg;
  }

  /** Execute all tool_calls in a message, append results, return combined text. */
  async function executeToolCalls(msg: OpenAI.Chat.ChatCompletionMessage): Promise<string[]> {
    const results: string[] = [];
    for (const tc of msg.tool_calls ?? []) {
      const fnName = tc.function.name;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>; } catch { /* empty */ }

      log("tool_call", `${fnName}(${JSON.stringify(args).slice(0, 200)})`);

      let toolResult: string;
      try {
        toolResult = await callMcp(mcpClient, fnName, args);
      } catch (err) {
        toolResult = `Error: ${String(err)}`;
      }

      log("tool_result", toolResult.slice(0, 500));
      messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
      results.push(toolResult);
    }
    return results;
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  while (true) {
    try {

      // ── define_goal ────────────────────────────────────────────────────────
      if (state === "define_goal") {
        actionsThisCycle = 0;
        // Reset context for a fresh goal cycle
        messages = [{ role: "system", content: soul }];

        // Fetch current status to ground the goal
        let statusText = "";
        try {
          statusText = await callMcp(mcpClient, "get_status", {});
        } catch { statusText = "(status unavailable)"; }

        const goalPrompt: ChatMessage = {
          role: "user",
          content:
            `Current status:\n${statusText}\n\n` +
            `You have no active goal. Based on your current state and surroundings, ` +
            `decide on ONE clear, achievable goal. State it in a single sentence starting with "My goal is".`,
        };

        const msg = await chat([goalPrompt]);
        const goalText = (msg.content ?? "").trim();
        currentGoal = goalText;
        log("goal", `New goal: ${goalText}`);

        // Announce the new goal aloud in the game world
        try {
          const sayText = goalText.length <= 280 ? goalText : goalText.slice(0, 277) + "…";
          await callMcp(mcpClient, "say", { message: sayText });
        } catch { /* non-fatal */ }

        state = "act";
        continue;
      }

      // ── act ────────────────────────────────────────────────────────────────
      if (state === "act") {
        if (actionsThisCycle >= MAX_ACTIONS_PER_GOAL) {
          log("system", `Max actions (${MAX_ACTIONS_PER_GOAL}) reached for goal — resetting.`);
          state = "define_goal";
          continue;
        }

        const actionPrompt: ChatMessage = {
          role: "user",
          content: `Your current goal: "${currentGoal}"\n\nTake ONE action toward your goal.`,
        };

        const msg = await chat([actionPrompt], allTools, "required");

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          await executeToolCalls(msg);
          actionsThisCycle++;
          state = "evaluate_goal";
        } else {
          // LLM gave text only despite tool_choice=required — log and retry
          log("system", "LLM did not call a tool. Retrying action.");
          // Remove the non-tool response so it doesn't pollute context
          messages.pop();
        }

        await sleep(ACTION_DELAY_MS);
        continue;
      }

      // ── evaluate_goal ──────────────────────────────────────────────────────
      if (state === "evaluate_goal") {
        const evalPrompt: ChatMessage = {
          role: "user",
          content:
            `Action completed.\n` +
            `Is your goal "${currentGoal}" now achieved? ` +
            `Reply with YES or NO on the first line, then briefly explain why.`,
        };

        const msg = await chat([evalPrompt]);
        const reply = (msg.content ?? "").trim();
        log("evaluate", reply.slice(0, 200));

        const achieved = reply.toUpperCase().startsWith("YES");
        if (achieved) {
          log("goal", `Goal achieved: ${currentGoal}`);

          // Announce goal completion aloud
          try {
            const achievement = `I did it! ${currentGoal}`;
            const sayText = achievement.length <= 280 ? achievement : achievement.slice(0, 277) + "…";
            await callMcp(mcpClient, "say", { message: sayText });
          } catch { /* non-fatal */ }

          state = "define_goal";
        } else {
          state = "act";
        }
        continue;
      }

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

    retries = 0;
  }
}

