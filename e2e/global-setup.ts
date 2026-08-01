import { seedOutboxFixture } from "./fixtures/seed-outbox.js";
import { seedLocalRelay } from "./fixtures/seed.js";

export default async function globalSetup() {
  await seedLocalRelay();
  await seedOutboxFixture();
}
