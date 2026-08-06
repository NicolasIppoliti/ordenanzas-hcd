// The OFF_CANVAS pattern, pinned on both sides of its boundary.
//
// It is a hardening rule: it rejects source. This project has shipped four of
// those that looked correct and rejected real data, so the rule carries a
// magnitude floor — a hamburger's bars cross by translating six pixels, a hover
// lifts by two, and the year strip bleeds its hover area eight into the page's
// padding. None of that parks anything off screen.
//
// The floor was loosened twice while building the header, and until now nothing
// failed if someone widened it until it matched nothing at all.
import { describe, expect, it } from 'vitest';
import { OFF_CANVAS } from './helpers/css';

describe('OFF_CANVAS catches what parks an element off screen', () => {
  it.each([
    ['left: -9999px', 'the declaration that caused the iOS scroll'],
    ['left:-9999px', 'the same one minified, which is what ships'],
    ['inset-inline-start: -9999px', 'its logical twin'],
    ['inset-inline: -9999px auto', 'the shorthand a refactor reaches for'],
    ['inset: auto auto auto -9999px', 'the four-value form'],
    ['margin-inline: -9999px auto', 'a margin large enough to carry it out'],
    ['margin-left: -100vw', 'the same in viewport units'],
    ['text-indent: -9999px', 'the old image-replacement trick'],
    ['transform: translateX(-100vw)', 'moving the paint instead of the box'],
    ['left: calc(-100vw)', 'wrapped in a calc'],
    ['top: -120rem', 'straight up and out'],
  ])('rejects %s — %s', (declaration) => {
    expect(`.thing { ${declaration}; }`).toMatch(OFF_CANVAS);
  });
});

describe('OFF_CANVAS leaves ordinary layout alone', () => {
  it.each([
    ['transform: translateY(-6px)', "the hamburger's bars crossing"],
    ['top: -2px', 'a hover lift'],
    ['inset: -2px', 'a focus ring drawn outside the box'],
    ['margin-inline: calc(var(--space-2) * -1)', "the year strip's hover bleed"],
    ['left: var(--space-2)', 'a custom property whose NAME contains -2'],
    ['margin-top: -4px', 'closing a gap between two rows'],
    ['border-radius: 4px', 'a declaration with no offset at all'],
  ])('accepts %s — %s', (declaration) => {
    expect(`.thing { ${declaration}; }`).not.toMatch(OFF_CANVAS);
  });
});
