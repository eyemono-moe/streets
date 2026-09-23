import type { Scenario } from "./define";
import type { UserId } from "./users";

/** シナリオを書く。人の ID は `users.ts` に無いものを書くと型で分かる。 */
export const defineScenario = (scenario: Scenario<UserId>) => scenario;

export type AppScenario = Scenario<UserId>;
