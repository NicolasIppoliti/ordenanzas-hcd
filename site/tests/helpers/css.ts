/** Reading CSS out of an `.astro` file, for the rules a rendered page cannot show.
 *
 * Astro scopes component styles, so they never reach the container's output and
 * this suite has no layout engine to measure them with. What it can do is read
 * the declarations the layout depends on — which is worth doing carefully,
 * because two of these assertions have already passed while the thing they
 * claimed to guard was broken.
 */

/** The body of a CSS rule, found by selector.
 *
 * Matched as a pattern, never with `indexOf` on a literal: that demands exactly
 * one space before the brace, and on `.doc-card{` it returns -1, so `slice(-1)`
 * hands back the last character of the file and the assertion blames a missing
 * declaration for a selector that merely moved.
 */
export function ruleBody(source: string, selector: string): string {
  const [first] = ruleBodies(source, selector);
  if (first === undefined) throw new Error(`no rule for ${selector}`);
  return first;
}

/** EVERY rule body for a selector, in source order.
 *
 * `ruleBody` alone reads the first and stops, so a declaration reintroduced
 * inside a `@media` block would never be seen by a guard that reads the base
 * rule — and a selector list (`.skip-link, .visually-hidden {`) matches no
 * pattern anchored on `{`, turning a passing guard into a hard failure naming
 * the wrong cause. Assert over all of them.
 */
export function ruleBodies(source: string, selector: string): string[] {
  // Only the style block when there is one: a whole `.astro` file carries
  // frontmatter braces, and a depth count that starts above them comes back
  // with the wrong body or none — silently, which is what this file exists to
  // stop.
  const styleAt = source.indexOf('<style');
  const scoped = styleAt === -1 ? source : source.slice(styleAt);
  return ruleBodiesIn(scoped, selector);
}

function ruleBodiesIn(source: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The selector may sit anywhere in a list, so it is followed either by `{` or
  // by a comma and more selectors before the brace.
  const pattern = new RegExp(`${escaped}\\s*(?:,[^{}]*)?\\{`, 'g');
  const bodies: string[] = [];
  for (const match of source.matchAll(pattern)) {
    const rest = source.slice(match.index ?? 0);
    const open = rest.indexOf('{');
    let depth = 0;
    for (let i = open; i < rest.length; i += 1) {
      if (rest[i] === '{') depth += 1;
      else if (rest[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          bodies.push(rest.slice(open + 1, i));
          break;
        }
      }
    }
  }
  return bodies;
}


/** Every way a rule can park an element outside the viewport.
 *
 * The negative must not be part of an identifier — `(?<![\w-])-\d` — because
 * `left: var(--space-2)` carries `-2` inside a custom property name and a looser
 * pattern flags it. It does NOT require whitespace before the minus: `left:-9999px`
 * is valid CSS, it is what a minifier emits, and it is the literal declaration
 * that caused the bug.
 *
 * `left: -9999px` is the classic, and it is what made every page scrollable
 * sideways on iOS Safari. A guard that only knows that one spelling invites the
 * same defect back through its logical twin — `inset-inline-start` is exactly
 * what a refactor reaches for — or through a transform, which moves the paint
 * without moving the box.
 */
export const OFF_CANVAS =
  new RegExp(
    [
      // Positioning, at a magnitude that could carry something out of the
      // viewport: three digits, or a viewport unit. NOT any negative — `top:
      // -2px` on a hover lift and `inset: -2px` on a focus ring are ordinary,
      // and a rule that rejects them is the shape this project has already had
      // to loosen four times. The margin branch below draws the same line for
      // the same reason.
      `(?:^|[\\s;{])(?:left|right|top|bottom|inset|inset-inline|inset-inline-start|inset-inline-end|inset-block|text-indent|translate)\\s*:[^;}]*?(?<![\\w-])-(?:\\d{3,}|\\d+\\s*(?:vw|vh|vmin|vmax)|\\d{2,}\\s*(?:rem|em))`,
      // Transforms move the paint without moving the box, which scrolls just
      // the same — but only at a magnitude that leaves the viewport. The
      // hamburger's two rules cross by translating six pixels, and a rule that
      // rejected that would be the same over-reach as flagging `top: -2px`.
      `(?:transform|translate)\\s*:[^;}]*?(?:translate3d?|translate[XY])?\\(\\s*-(?:\\d{3,}|\\d+\\s*(?:vw|vh|vmin|vmax)|\\d{2,}\\s*(?:rem|em))`,
      // Margins are different: a negative margin is an ordinary layout tool, and
      // the year strip legitimately bleeds its hover area 8px into the page's
      // padding. Only a magnitude that could carry an element off screen counts —
      // three digits, or any viewport unit.
      `(?:^|[\\s;{])(?:margin-left|margin-top|margin-inline|margin-inline-start|margin-block)\\s*:[^;}]*?(?<![\\w-])-(?:\\d{3,}|\\d+\\s*(?:vw|vh|vmin|vmax))`,
    ].join('|')
  );


/** A slice of rendered markup between two anchors, or a loud failure.
 *
 * `slice(indexOf(a), indexOf(b))` collapses to an empty string when either is
 * missing, and every negative assertion over an empty string passes — which is
 * how a whole block of neutrality guards could go green while the copy breached.
 */
export function markupBetween(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  if (start === -1) throw new Error(`no ${from} in the rendered markup`);
  const end = source.indexOf(to, start);
  if (end === -1) throw new Error(`no ${to} after ${from} in the rendered markup`);
  return source.slice(start, end);
}

/** CSS with its comments removed.
 *
 * A pattern that hunts for a declaration will otherwise find the comment
 * explaining why that declaration is forbidden — which is exactly what the
 * off-canvas sweep did on its first run, flagging the paragraph documenting the
 * bug as the bug.
 */
export function withoutComments(css: string): string {
  // All three kinds, because the off-canvas sweep reads whole `.astro` files:
  // the CSS form, the `//` of the frontmatter, and the HTML form in the markup.
  // Any of them can carry the very declaration the pattern hunts for, in the
  // sentence explaining why it is forbidden.
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
