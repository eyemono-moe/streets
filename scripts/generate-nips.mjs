import { writeFile } from "node:fs/promises";
import {
  docsPath,
  readInventory,
  readKindInventory,
  renderNipSupport,
  validateInventory,
  validateKindInventory,
} from "./nip-support.mjs";

const inventory = await readInventory();
const kinds = await readKindInventory();
await validateInventory(inventory);
validateKindInventory(inventory, kinds);
await writeFile(docsPath, renderNipSupport(inventory, kinds));
