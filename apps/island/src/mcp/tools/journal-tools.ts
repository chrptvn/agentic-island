import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpSession } from "../mcp-server.js";
import { requireCharacter } from "./character-tools.js";
import { writeJournalEntry, readJournalEntries } from "../../persistence/db.js";

export function registerJournalTools(server: McpServer, session: McpSession): void {
  server.tool(
    "write_journal",
    "Write an entry to the character's knowledge base. Use this ONLY to record reusable game knowledge: crafting recipes you've discovered, resource locations, survival tips, tool capabilities, or any trick worth remembering. Do NOT use it as a narrative diary — do not record events like 'I built a campfire' or 'I moved north'.",
    {
      content: z.string().min(1).describe("The text content to record in the journal"),
    },
    async ({ content }) => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const entry = writeJournalEntry(character_id, content);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ id: entry.id, created_at: entry.created_at, message: "Journal entry written." }, null, 2),
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );

  server.tool(
    "read_journal",
    "Read all knowledge base entries for the character, ordered oldest to newest. Use this to recall crafting recipes, survival tips, or resource discoveries you previously recorded.",
    {},
    async () => {
      const check = requireCharacter(session);
      if (typeof check !== "string") return check;
      const character_id = check;
      try {
        const entries = readJournalEntries(character_id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(entries, null, 2),
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
  );
}
