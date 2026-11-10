/**
 * Berkeley sockets on the server side (CN 6.1.3): a listening socket with a backlog. The kernel
 * finishes handshakes on its own and queues the connections; accept() takes one off the queue
 * and returns a new socket, or blocks when the queue is empty. A full queue ignores the SYN,
 * and the client retries later.
 */

export type Call = { op: "listen"; backlog: number } | { op: "accept" } | { op: "connect"; client: string };

export interface Outcome {
  call: Call;
  /** accept: blocked until a connection arrives. connect: queued, handed to a blocked accept, or ignored. */
  result: "ok" | "blocks" | "queued" | "delivered" | "ignored";
  /** Socket descriptor returned by accept (or handed to the waiting accept). */
  fd?: number;
  queue: string[];
  sockets: number;
}

export function serve(calls: Call[]): Outcome[] {
  let backlog = 0;
  let next = 4;
  let sockets = 1;
  let waiting = false;
  const queue: string[] = [];
  const out: Outcome[] = [];
  for (const call of calls) {
    if (call.op === "listen") {
      backlog = call.backlog;
      out.push({ call, result: "ok", queue: [...queue], sockets });
    } else if (call.op === "accept") {
      if (queue.length) {
        queue.shift();
        sockets++;
        out.push({ call, result: "ok", fd: next++, queue: [...queue], sockets });
      } else {
        waiting = true;
        out.push({ call, result: "blocks", queue: [...queue], sockets });
      }
    } else if (waiting) {
      waiting = false;
      sockets++;
      out.push({ call, result: "delivered", fd: next++, queue: [...queue], sockets });
    } else if (queue.length < backlog) {
      queue.push(call.client);
      out.push({ call, result: "queued", queue: [...queue], sockets });
    } else {
      out.push({ call, result: "ignored", queue: [...queue], sockets });
    }
  }
  return out;
}
