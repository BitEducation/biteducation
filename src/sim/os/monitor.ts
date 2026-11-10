/**
 * A one-slot buffer guarded by a monitor with condition variables. Two consumers and one
 * producer follow a fixed arrival order; what differs is the signal semantics (Mesa: the woken
 * thread just becomes ready; Hoare: it gets the monitor at once) and whether the consumer
 * re-checks the condition with `while` or trusts it with `if`.
 */

export type Semantics = "mesa" | "hoare";
export type Recheck = "if" | "while";

export interface MonEvent {
  phase: "entra" | "espera" | "sinal" | "rouba" | "volta";
  who: string;
  what: string;
  /** Items in the buffer after the event (can go negative: the bug). */
  count: number;
  inside: string | null;
  entry: string[];
  waiting: string[];
  tone: "active" | "good" | "bad" | "warn";
}

export function monitorRun(sem: Semantics, check: Recheck) {
  const ev: MonEvent[] = [];
  let count = 0;
  let inside: string | null = null;
  let entry: string[] = [];
  let waiting: string[] = [];
  const log = (phase: MonEvent["phase"], who: string, what: string, tone: MonEvent["tone"] = "active") =>
    ev.push({ phase, who, what, count, inside, entry: [...entry], waiting: [...waiting], tone });

  // C1 arrives first and finds the buffer empty.
  inside = "C1";
  log("entra", "C1", "entra no monitor");
  waiting = ["C1"];
  inside = null;
  log("espera", "C1", "buffer vazio: wait(naoVazio) solta o monitor e dorme", "warn");

  // P enters; C2 arrives while P is inside and queues for the monitor.
  inside = "P";
  log("sinal", "P", "entra no monitor");
  entry = ["C2"];
  log("sinal", "C2", "chega e espera na entrada", "warn");
  count = 1;
  log("sinal", "P", "põe um item", "good");

  let bug = false;
  let stolen = false;
  if (sem === "hoare") {
    // The signaller hands the monitor straight to the waiter.
    waiting = [];
    inside = "C1";
    log("sinal", "P", "signal(naoVazio): passa o monitor direto ao C1", "active");
    count = 0;
    log("sinal", "C1", "retira o item que acabou de ser posto", "good");
    inside = "P";
    log("sinal", "P", "recebe o monitor de volta e sai");
    inside = "C2";
    entry = [];
    log("rouba", "C2", "entra: buffer vazio", "warn");
    waiting = ["C2"];
    inside = null;
    log("rouba", "C2", "wait(naoVazio): dorme até o próximo item", "warn");
  } else {
    // Mesa: C1 only goes to the entry queue, behind C2.
    waiting = [];
    entry = ["C2", "C1"];
    log("sinal", "P", "signal(naoVazio): o C1 vai para a fila de entrada, atrás do C2");
    inside = null;
    log("sinal", "P", "sai do monitor");
    inside = "C2";
    entry = ["C1"];
    log("rouba", "C2", "entra primeiro: o buffer tem item");
    count = 0;
    stolen = true;
    log("rouba", "C2", "retira o item e sai", "good");
    inside = "C1";
    entry = [];
    log("volta", "C1", "volta do wait(), dentro do monitor");
    if (check === "if") {
      count = -1;
      bug = true;
      log("volta", "C1", "confiou no if: retira de um buffer vazio", "bad");
    } else {
      waiting = ["C1"];
      inside = null;
      log("volta", "C1", "reconfere: vazio, dorme de novo", "good");
    }
  }
  return { events: ev, bug, stolen, final: count };
}
