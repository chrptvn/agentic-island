/** A character catalog layer definition — describes one customizable layer. */
export interface CharacterCatalogLayer {
  order: number;
  required: boolean;
  items?: string[];
  pathTemplate: string;
  /** Available color names for colorable items in this layer. */
  colors?: string[];
  /** Appearance key storing the chosen color (e.g. "legs_color"). */
  colorKey?: string;
  /** Subset of items that support color variants; if absent, all items are colorable. */
  colorableItems?: string[];
  /** Path template used when the selected item is colorable (contains {color}). */
  colorPathTemplate?: string;
  /**
   * Per-item gender restrictions. If an item key is present, only the listed genders
   * can use it. Items not listed here are available to all genders.
   * Example: { "shorts": ["male"], "vest": ["male"] }
   */
  itemGenders?: Record<string, string[]>;
}

/** Full character catalog returned by the island for the passport designer. */
export interface CharacterCatalog {
  tileSize: number;
  spriteDir: string;
  genders: string[];
  skinColors: string[];
  layers: Record<string, CharacterCatalogLayer>;
}
