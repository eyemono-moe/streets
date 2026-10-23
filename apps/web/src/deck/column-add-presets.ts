import type { ColumnPresetKind } from "@streets/core/deck/column-presets";
import type { ColumnPicker } from "@streets/core/deck/deck-ui";
import { t } from "../i18n/locale";

type ColumnAddPreset = {
  /** `search` は検索パネルへ移り、結果を見てからカラムにする。 */
  kind: ColumnPresetKind | ColumnPicker | "search";
  readonly label: string;
  readonly description: string;
  icon: string;
  /** コマンドパレットで探すときの別の言い方。 */
  readonly keywords: string[];
};

/** 文言は getter で引く。言語を切り替えたあとに読まれても追従させるため。 */
const preset = (
  kind: ColumnAddPreset["kind"],
  icon: string,
): ColumnAddPreset => ({
  kind,
  icon,
  get label() {
    return t(`deck.addColumn.presets.${kind}.label`);
  },
  get description() {
    return t(`deck.addColumn.presets.${kind}.description`);
  },
  get keywords() {
    return [...t(`deck.addColumn.presets.${kind}.keywords`)];
  },
});

/** カラムの追加パネルとコマンドパレットに並べる、足せるカラムの種類。 */
export const COLUMN_ADD_PRESETS: readonly ColumnAddPreset[] = [
  preset("home", "i-material-symbols:home-outline-rounded"),
  preset("notifications", "i-material-symbols:notifications-outline-rounded"),
  preset("search", "i-material-symbols:search-rounded"),
  preset("relay", "i-material-symbols:globe"),
  preset("user", "i-material-symbols:person-outline-rounded"),
  preset("channels", "i-material-symbols:forum-outline-rounded"),
  preset("bookmarks", "i-material-symbols:bookmark-outline-rounded"),
  preset("follow-sets", "i-material-symbols:format-list-bulleted-rounded"),
  preset("followees-activity", "i-material-symbols:vital-signs-rounded"),
  preset("timeslip", "i-material-symbols:history-rounded"),
];
