/**
 * Sanitizes a name to be used as an MCP server name.
 * MCP clients require server names to contain only alphanumeric characters.
 *
 * @param name - The name to sanitize (e.g., island name)
 * @returns A sanitized name containing only lowercase alphanumeric characters
 *
 * @example
 * sanitizeServerName("Demo Island") // => "demoisland"
 * sanitizeServerName("My @#$ Island!") // => "myisland"
 * sanitizeServerName("123 Start") // => "123start"
 * sanitizeServerName("") // => "unnamed"
 */
export function sanitizeServerName(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'unnamed';
  }

  // Convert to lowercase and remove all non-alphanumeric characters
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  // If empty after sanitization, return default
  return sanitized || 'unnamed';
}
