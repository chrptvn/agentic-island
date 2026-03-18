import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "../..", "config", "recipes.json");

export interface Recipe {
  ingredients: Record<string, number>;
  output: Record<string, number>;
  description: string;
}

interface RecipesConfig {
  recipes: Record<string, Recipe>;
}

function loadConfig(): RecipesConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

export let RECIPES: Record<string, Recipe> = loadConfig().recipes;

export function reloadRecipes(): void {
  const fresh = loadConfig().recipes;
  // Mutate in place so existing imports see the update
  for (const k of Object.keys(RECIPES)) delete RECIPES[k];
  Object.assign(RECIPES, fresh);
}

export function CONFIG_PATH_RECIPES() { return CONFIG_PATH; }

