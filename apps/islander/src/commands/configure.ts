import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { getConfig, saveConfig } from "../lib/config.js";

export function registerConfigureCommand(program: Command): void {
  program
    .command("configure")
    .description("Configure the LLM provider (OpenAI-compatible API)")
    .action(async () => {
      const config = getConfig();

      p.intro(pc.cyan("Islander LLM Configuration"));

      const result = await p.group(
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
          model: () =>
            p.text({
              message: "Model name",
              placeholder: "llama3",
              initialValue: config.llm.model || "llama3",
              validate: (v) => (v.trim() ? undefined : "Model name is required"),
            }),
        },
        { onCancel: () => { p.cancel("Cancelled."); process.exit(0); } },
      );

      config.llm = {
        baseURL: result.baseURL.trim(),
        apiKey: result.apiKey.trim(),
        model: result.model.trim(),
      };

      saveConfig(config);
      p.outro(pc.green("LLM configuration saved."));
    });
}
