import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpSession } from "../mcp-server.js";
import { requireCharacter } from "./character-tools.js";

const BASE_URL = `http://localhost:${process.env.ISLAND_PORT ?? 3002}`;

export function registerSayTools(server: McpServer, session: McpSession): void {
  server.tool(
    "say",
    "Make the character say something out loud. The text (max 280 characters) will appear as a speech bubble above the character in the UI for 8 seconds.",
    {
      text: z.string().min(1).max(280).describe("What the character says (max 280 characters)"),
    },
    async ({ text }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
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
