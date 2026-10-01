import type { AppScenario } from "../scenario";
import { allInScenario } from "./all-in";
import channelsAndLists from "./channels-and-lists";
import contentWarning from "./content-warning";
import home from "./home";
import kinds from "./kinds";
import manyColumns from "./many-columns";
import media from "./media";
import notifications from "./notifications";
import profile from "./profile";
import thread from "./thread";

/** シナリオの一覧。新しいシナリオはここに足す。キーがコマンドで指す名前。 */
const individualScenarios = {
  home,
  notifications,
  thread,
  profile,
  "many-columns": manyColumns,
  media,
  "channels-and-lists": channelsAndLists,
  "content-warning": contentWarning,
  kinds,
} satisfies Record<string, AppScenario>;

export const scenarios = {
  ...individualScenarios,
  "all-in": allInScenario(Object.values(individualScenarios)),
};

export type ScenarioName = keyof typeof scenarios;
