import type { AppScenario } from "../scenario";
import home from "./home";
import manyColumns from "./many-columns";
import media from "./media";
import notifications from "./notifications";
import profile from "./profile";
import thread from "./thread";

/** シナリオの一覧。新しいシナリオはここに足す。キーがコマンドで指す名前。 */
export const scenarios = {
  home,
  notifications,
  thread,
  profile,
  "many-columns": manyColumns,
  media,
} satisfies Record<string, AppScenario>;

export type ScenarioName = keyof typeof scenarios;
