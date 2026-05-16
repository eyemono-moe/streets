import { seedLocalRelay } from "./fixtures/seed.js";

export default async function globalSetup() {
  await seedLocalRelay();
}
