import type { EventColumn } from "../../contracts/types.ts";

export const columns: EventColumn[] = [
  { key: "t", label: "Quando" },
  { key: "who", label: "Onde" },
  { key: "what", label: "Evento" },
  { key: "detail", label: "Detalhe" },
];
