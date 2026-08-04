import { seedBudgetFixture } from "./fixtures/seed-budget.js";
import { seedCapFixture } from "./fixtures/seed-cap.js";
import { seedOutboxFixture } from "./fixtures/seed-outbox.js";
import { seedLocalRelay } from "./fixtures/seed.js";

export default async function globalSetup() {
  await seedLocalRelay();
  await seedOutboxFixture();
  await seedBudgetFixture();
  await seedCapFixture();
}
