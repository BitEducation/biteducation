/**
 * Appending one block to a file touches three blocks on disk: the free-block bitmap, the inode and
 * the data block. A crash can leave any subset written. Journaling writes them to a log first,
 * seals them with a commit record and only then copies them to their real places.
 */
export type Part = "B" | "I" | "D";
export const PARTS: Part[] = ["B", "I", "D"];

export interface Outcome {
  written: Part[];
  leak: boolean;
  garbage: boolean;
  doubleUse: boolean;
  lost: boolean;
  severity: "ok" | "warn" | "bad";
}

/** What a crash leaves behind when only `written` reached the disk. */
export function outcome(written: Part[]): Outcome {
  const b = written.includes("B");
  const i = written.includes("I");
  const d = written.includes("D");
  // Bitmap says used, but no inode points to the block.
  const leak = b && !i;
  // The inode points to a block that never received the new data.
  const garbage = i && !d;
  // The inode uses a block the bitmap still calls free: it can be handed out again.
  const doubleUse = i && !b;
  // The data hit the disk but nothing references it.
  const lost = d && !i;
  return {
    written,
    leak,
    garbage,
    doubleUse,
    lost,
    severity: garbage || doubleUse ? "bad" : leak ? "warn" : "ok",
  };
}

/** Every crash that wrote some but not all of the three blocks. */
export function partialCrashes(): Outcome[] {
  const out: Outcome[] = [];
  for (let mask = 1; mask < 7; mask++) out.push(outcome(PARTS.filter((_, k) => mask & (1 << k))));
  return out;
}

export type Write = { region: "journal" | "home"; what: "TxB" | Part | "TxE" };

/** Full data journaling: log TxB and the three blocks, commit with TxE, then checkpoint. */
export const FULL: Write[] = [
  { region: "journal", what: "TxB" },
  { region: "journal", what: "I" },
  { region: "journal", what: "B" },
  { region: "journal", what: "D" },
  { region: "journal", what: "TxE" },
  { region: "home", what: "I" },
  { region: "home", what: "B" },
  { region: "home", what: "D" },
];
export const COMMIT_AT = FULL.findIndex((w) => w.what === "TxE") + 1;

/** After a crash with `done` writes on disk, recovery either discards or replays the transaction. */
export function recover(done: number): "nothing" | "discard" | "replay" | "clean" {
  if (done === 0) return "nothing";
  if (done < COMMIT_AT) return "discard";
  if (done < FULL.length) return "replay";
  return "clean";
}

/** Disk writes for appending `n` data blocks: plain, full journaling and ordered (metadata only). */
export function writesFor(n: number) {
  return { plain: n + 2, full: 2 * (n + 2) + 2, ordered: n + 2 * 2 + 2 };
}

/** Bytes of inode table fsck must read on a disk of `bytes` with one inode per `ratio` bytes. */
export const inodeBytes = (bytes: number, ratio = 16384, inode = 256) => (bytes / ratio) * inode;
