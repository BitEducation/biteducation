import type { EventColumn } from "../../contracts/types.ts";

export const columns: EventColumn[] = [
  { key: "t", label: "Tick" },
  { key: "who", label: "Quem" },
  { key: "what", label: "Evento" },
  { key: "detail", label: "Detalhe" },
];
