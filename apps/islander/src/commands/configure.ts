import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { getConfig, saveConfig } from "../lib/config.js";

interface ModelsResponse {
  data: { id: string }[];
}

async function fetchModels(baseURL: string, apiKey: string): Promise<string[]> {
  const url = baseURL.replace(/\/$/, "") + "/models";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as ModelsResponse;
  return json.data.map((m) => m.id).sort();
}

export function registerConfigureCommand(program: Command): void {
  program
    .command("configure")
    .description("Configure the LLM provider (OpenAI-compatible API)")
    .action(async () => {
      const config = getConfig();

      p.intro(pc.cyan("Islander LLM Configuration"));

      // ── Step 1: URL + API key ──────────────────────────────────────────────
      const conn = await p.group(
        {
          baseURL: () =>
            p.text({
              message: "LLM API base URL",
              placeholder: "http://localhost:8080/v1",
              initialValue: config.llm.baseURL || "http://localhost:8080/v1",
              validate: (v) => (v.trim() ? undefined : "Base URL is required"),
            }),
          apiKey: () =>
            p.text({
              message: "API key (leave empty for local/self-hosted)",
              placeholder: "(none)",
              initialValue: config.llm.apiKey || "",
            }),
        },
        { onCancel: () => { p.cancel("Cancelled."); process.exit(0); } },
      );

      // ── Step 2: Verify API + fetch models ─────────────────────────────────
      const spinner = p.spinner();
      spinner.start("Connecting to LLM API…");

      let models: string[] = [];
      try {
        models = await fetchModels(conn.baseURL.trim(), conn.apiKey.trim());
        spinner.stop(pc.green(`Connected — ${models.length} model(s) available`));
      } catch (err) {
        spinner.stop(pc.yellow(`Could not reach API: ${(err as Error).message}`));
        const proceed = await p.confirm({ message: "Continue anyway and enter model name manually?" });
        if (!proceed || p.isCancel(proceed)) {
          p.cancel("Aborted.");
          process.exit(0);
        }
      }

      // ── Step 3: Model selection ───────────────────────────────────────────
      let model: string;
      if (models.length > 0) {
        const currentIdx = models.indexOf(config.llm.model);
        const choices = models.map((id) => ({ value: id, label: id }));
        // Put the current model first if it exists
        if (currentIdx > 0) {
          const [cur] = choices.splice(currentIdx, 1);
          choices.unshift(cur);
        }
        const selected = await p.select({
          message: "Select model",
          options: choices,
          initialValue: config.llm.model || models[0],
        });
        if (p.isCancel(selected)) { p.cancel("Cancelled."); process.exit(0); }
        model = selected as string;
      } else {
        const typed = await p.text({
          message: "Model name",
          placeholder: "llama3",
          initialValue: config.llm.model || "",
          validate: (v) => (v.trim() ? undefined : "Model name is required"),
        });
        if (p.isCancel(typed)) { p.cancel("Cancelled."); process.exit(0); }
        model = (typed as string).trim();
      }

      config.llm = {
        baseURL: conn.baseURL.trim(),
        apiKey: conn.apiKey.trim(),
        model,
      };

      saveConfig(config);
      p.outro(pc.green(`Saved — using model ${pc.bold(model)}`));
    });
}
