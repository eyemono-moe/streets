import { seedBudgetFixture } from "./fixtures/seed-budget.js";
import { seedCapFixture } from "./fixtures/seed-cap.js";
import { seedNotificationFixture } from "./fixtures/seed-notification.js";
import { seedOutboxFixture } from "./fixtures/seed-outbox.js";
import { seedPreviewFixture } from "./fixtures/seed-preview.js";
import { seedThreadFixture } from "./fixtures/seed-thread.js";
import { seedLocalRelay } from "./fixtures/seed.js";

export default async function globalSetup() {
  await seedLocalRelay();
  await seedOutboxFixture();
  await seedBudgetFixture();
  await seedCapFixture();
  await seedPreviewFixture();
  await seedThreadFixture();
  await seedNotificationFixture();
}
