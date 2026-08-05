// Provenance-and-staleness spec + design.md "Sync mechanics": two layers.
// Layer 1 (this module's computeStaleness) renders build-time from
// last_success_at. Layer 2 (STALENESS_CLIENT_SCRIPT) recomputes at view
// time and may only ADD the notice, never remove one already rendered —
// a visitor with JS disabled must see an answer that is never more
// optimistic than reality.
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface StalenessState {
  readonly lastSuccessAt: string;
  readonly thresholdDays: number;
  readonly daysSince: number;
  readonly isStale: boolean;
}

export function computeStaleness(
  lastSuccessAt: string,
  thresholdDays: number,
  now: Date = new Date()
): StalenessState {
  const last = new Date(lastSuccessAt);
  const daysSince = Math.floor((now.getTime() - last.getTime()) / MS_PER_DAY);
  return { lastSuccessAt, thresholdDays, daysSince, isStale: daysSince > thresholdDays };
}

// ~300 bytes. Reads the notice element's own data attributes, so it needs
// no build-time data injected beyond what is already on the page. It only
// ever clears `hidden` — it must never set it, because that would make a
// visible notice disappear behind stale client-side arithmetic.
export const STALENESS_CLIENT_SCRIPT = `(function(){
var el=document.getElementById('staleness-notice');
if(!el)return;
var last=new Date(el.dataset.lastSuccess);
var threshold=Number(el.dataset.threshold);
var days=Math.floor((Date.now()-last.getTime())/86400000);
if(days>threshold){el.hidden=false;}
})();`;
