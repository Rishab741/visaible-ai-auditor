/** affectedUrls is stored as a JSON-array string; some legacy rows may be a bare string. */
export function parseAffectedUrls(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}
