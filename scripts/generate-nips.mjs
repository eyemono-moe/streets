import { writeFile } from "node:fs/promises";
import {
  docsPath,
  readInventory,
  renderNipSupport,
  validateInventory,
} from "./nip-support.mjs";

const inventory = await readInventory();
await validateInventory(inventory);
await writeFile(docsPath, renderNipSupport(inventory));
