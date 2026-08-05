// Task 4a.3: staleness 29/30/31-day boundaries; the runtime script only adds
// the notice, never removes one already rendered (design.md "Sync mechanics").
import { describe, expect, it } from 'vitest';
import { computeStaleness, STALENESS_CLIENT_SCRIPT } from '../src/lib/staleness';

const THRESHOLD = 30;
const NOW = new Date('2026-08-05T00:00:00Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('computeStaleness', () => {
  it('is not stale at exactly 29 days', () => {
    const state = computeStaleness(daysAgo(29), THRESHOLD, NOW);
    expect(state.isStale).toBe(false);
    expect(state.daysSince).toBe(29);
  });

  it('is not stale at exactly 30 days (the threshold itself)', () => {
    const state = computeStaleness(daysAgo(30), THRESHOLD, NOW);
    expect(state.isStale).toBe(false);
    expect(state.daysSince).toBe(30);
  });

  it('is stale at 31 days', () => {
    const state = computeStaleness(daysAgo(31), THRESHOLD, NOW);
    expect(state.isStale).toBe(true);
    expect(state.daysSince).toBe(31);
  });
});

describe('STALENESS_CLIENT_SCRIPT', () => {
  it('only ever sets hidden to false — it can add the notice, never remove it', () => {
    expect(STALENESS_CLIENT_SCRIPT).not.toMatch(/hidden\s*=\s*true/);
    expect(STALENESS_CLIENT_SCRIPT).toMatch(/hidden\s*=\s*false/);
  });
});
