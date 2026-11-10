/**
 * Disk arm scheduling over cylinders 0..max. Each algorithm returns the service order and the
 * arm path (including trips to the edge for SCAN and C-SCAN); the return sweep of the circular
 * variants is counted as movement.
 */

export type DiskAlgo = "fcfs" | "sstf" | "scan" | "look" | "cscan" | "clook";

export interface DiskResult {
  order: number[];
  /** Arm positions in sequence, starting at the head. */
  path: number[];
  total: number;
  /** For each served request (same order), the distance travelled until it was served. */
  servedAt: number[];
}

function finish(head: number, path: number[], requests: readonly number[]): DiskResult {
  let total = 0;
  const servedAt: number[] = [];
  const order: number[] = [];
  const pending = [...requests];
  let prev = head;
  for (const pos of path.slice(1)) {
    total += Math.abs(pos - prev);
    prev = pos;
    const i = pending.indexOf(pos);
    if (i >= 0) {
      pending.splice(i, 1);
      order.push(pos);
      servedAt.push(total);
    }
  }
  return { order, path, total, servedAt };
}

export function diskSchedule(
  head: number,
  requests: readonly number[],
  algo: DiskAlgo,
  o: { max: number; up: boolean },
): DiskResult {
  const path = [head];
  if (algo === "fcfs") return finish(head, [head, ...requests], requests);
  if (algo === "sstf") {
    const left = [...requests];
    let at = head;
    while (left.length) {
      // nearest first; ties go to the lower cylinder
      let best = 0;
      for (let i = 1; i < left.length; i++) {
        const d = Math.abs((left[i] ?? 0) - at);
        const bd = Math.abs((left[best] ?? 0) - at);
        if (d < bd || (d === bd && (left[i] ?? 0) < (left[best] ?? 0))) best = i;
      }
      at = left.splice(best, 1)[0] ?? at;
      path.push(at);
    }
    return finish(head, path, requests);
  }
  const up = [...requests].filter((r) => r >= head).sort((a, b) => a - b);
  const down = [...requests].filter((r) => r < head).sort((a, b) => b - a);
  const [first, second] = o.up ? [up, down] : [down, up];
  const edge = o.up ? o.max : 0;
  const far = o.up ? 0 : o.max;
  path.push(...first);
  if (algo === "scan" || algo === "look") {
    if (algo === "scan" && second.length && path[path.length - 1] !== edge) path.push(edge);
    path.push(...second);
  } else {
    if (second.length) {
      // circular: sweep back to the start and serve in the same direction again
      const again = [...second].reverse();
      if (algo === "cscan") {
        if (path[path.length - 1] !== edge) path.push(edge);
        path.push(far);
      }
      path.push(...again);
    }
  }
  return finish(head, path, requests);
}
