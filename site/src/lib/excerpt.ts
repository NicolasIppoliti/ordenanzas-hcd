// Short plain-text preview of an extracted document body, used by DocCard
// on the index page. Never fabricates: it only ever trims real extracted
// text, never synthesizes a summary.
const DEFAULT_MAX_LENGTH = 220;

export function buildExcerpt(text: string | null, maxLength: number = DEFAULT_MAX_LENGTH): string | null {
  if (text === null) return null;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return null;
  if (normalized.length <= maxLength) return normalized;

  const truncated = normalized.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const cut = lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated;
  return `${cut}…`;
}
