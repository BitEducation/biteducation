/**
 * Clock hardware and software (MOS 5.5): a crystal drives a counter loaded from a holding
 * register; each time it reaches zero the clock interrupts (a tick). Pending alarms sit in a
 * list sorted by time where each entry keeps only the ticks after the previous one, so a tick
 * decrements just the head. An alarm fires on the first tick at or after its requested time.
 */

export interface Alarm {
  who: string;
  ms: number;
}

export function program(crystalHz: number, hz: number) {
  const holding = Math.round(crystalHz / hz);
  return { holding, tickUs: (holding / crystalHz) * 1e6 };
}

/** Ticks until each alarm, rounded up, sorted, as differences from the previous entry. */
export function deltaList(alarms: Alarm[], tickMs: number) {
  const sorted = alarms
    .map((a) => ({ ...a, ticks: Math.ceil(a.ms / tickMs) }))
    .sort((a, z) => a.ticks - z.ticks || a.who.localeCompare(z.who));
  let prev = 0;
  return sorted.map((a) => {
    const d = a.ticks - prev;
    prev = a.ticks;
    return { ...a, delta: d, firesMs: a.ticks * tickMs, lateMs: a.ticks * tickMs - a.ms };
  });
}

/** Share of CPU time spent in the tick handler, in percent. */
export const overhead = (hz: number, handlerUs: number) => (hz * handlerUs) / 1e4;
