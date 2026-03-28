import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpSession } from "../mcp-server.js";

const BASE_URL = `http://localhost:${process.env.WORLD_PORT ?? 3002}`;

export function registerSayTools(server: McpServer, session: McpSession): void {
  server.tool(
    "say",
    "Make the character say something out loud. The text (max 280 characters) will appear as a speech bubble above the character in the UI for 8 seconds.",
    {
      character_id: z.string().min(1).describe("The character's unique id (e.g. 'Carl')"),
      text: z.string().min(1).max(280).describe("What the character says (max 280 characters)"),
    },
    async ({ character_id, text }) => {
      if (!session.username) return { content: [{ type: "text", text: "Not connected. Call the 'connect' tool first with your username." }], isError: true };
      try {
        const res = await fetch(`${BASE_URL}/api/say`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: character_id, text }),
        });
        const data = await res.json() as { message?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        return {
          content: [{ type: "text", text: data.message ?? `${character_id} says: ${text}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
