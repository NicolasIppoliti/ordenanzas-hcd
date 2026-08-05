// Short plain-text preview of an extracted document body, used by DocCard
// on the index page. Never fabricates: it only ever trims real extracted
// text, never synthesizes a summary.
const DEFAULT_MAX_LENGTH = 220;

/** Every document opens with the same municipal letterhead — 875 of the 894
 * text-bearing ones (97%) then reach a first article. Excerpting from character
 * zero made every card read identically, so the preview starts at the article
 * when there is one. This skips text, it never invents any: the 13 documents
 * with no anchor keep opening where they open. */
const FIRST_ARTICLE = /Art[íi]culo\s*1\s*[ºo°]?\s*[:.\-]/i;

export function buildExcerpt(text: string | null, maxLength: number = DEFAULT_MAX_LENGTH): string | null {
  if (text === null) return null;
  const anchor = text.search(FIRST_ARTICLE);
  const body = anchor === -1 ? text : text.slice(anchor);
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return null;
  if (normalized.length <= maxLength) return normalized;

  const truncated = normalized.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const cut = lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated;
  return `${cut}…`;
}
