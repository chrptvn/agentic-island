/** A character catalog layer definition — describes one customizable layer. */
export interface CharacterCatalogLayer {
  order: number;
  required: boolean;
  items?: string[];
  pathTemplate: string;
}

/** Full character catalog returned by the island for the passport designer. */
export interface CharacterCatalog {
  tileSize: number;
  spriteDir: string;
  genders: string[];
  skinColors: string[];
  layers: Record<string, CharacterCatalogLayer>;
}
