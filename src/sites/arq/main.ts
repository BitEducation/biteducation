import { bootSite } from "../../ui/app.ts";
import { cross } from "../shared/cross.ts";
import { catalog } from "./catalog.ts";
import { columns } from "./columns.ts";
import { glossary } from "./glossary.ts";

void bootSite({
  catalog,
  glossary,
  columns,
  cross,
});
