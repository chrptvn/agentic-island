import { resolve, sep } from "node:path";

/**
 * Validate that a resolved file path stays within the expected base directory.
 * Returns the safe absolute path, or null if the path escapes the base.
 */
export function safePath(base: string, ...segments: string[]): string | null {
  const resolvedBase = resolve(base);
  const resolvedTarget = resolve(base, ...segments);

  // The target must be exactly the base or start with base + separator
  if (
    resolvedTarget !== resolvedBase &&
    !resolvedTarget.startsWith(resolvedBase + sep)
  ) {
    return null;
  }

  return resolvedTarget;
}
