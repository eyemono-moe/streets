import { buildColumn } from "@streets/core/deck/column-presets";
import { isColumnPicker } from "@streets/core/deck/deck-ui";
import { SHORTCUT_LABELS } from "@streets/core/settings/keymap";
import type { SearchEntry } from "@streets/core/signal/search";
import { COLUMN_ADD_PRESETS } from "../deck/column-add-presets";
import { t } from "../i18n/locale";
import type { UiEvent } from "../ui-events";

export type PaletteAction = SearchEntry & {
  kind: "action";
  event: UiEvent | (() => UiEvent);
  requiresSignIn?: boolean;
};

// 言語を切り替えたあとにも追従するよう、文言は候補を作る時点で引く。
const columnActions = (): PaletteAction[] =>
  COLUMN_ADD_PRESETS.map(({ kind, label, keywords }): PaletteAction => {
    const base = {
      id: `column.${kind}`,
      kind: "action",
      section: t("signal.sections.column"),
    } as const;
    const labelColumn = t("signal.columnActions.labelColumn", { label });
    if (kind === "search") {
      return {
        ...base,
        title: t("signal.columnActions.search"),
        keywords: [labelColumn, ...keywords],
        event: { type: "deck/open-panel", panel: "search" },
      };
    }
    if (isColumnPicker(kind)) {
      return {
        ...base,
        title: t("signal.columnActions.pick", { label }),
        keywords: [labelColumn, ...keywords],
        event: { type: "deck/open-column-picker", picker: kind },
      };
    }
    return {
      ...base,
      title: t("signal.columnActions.add", { label }),
      keywords: [label, ...keywords],
      event: () => {
        const column = buildColumn(kind, "");
        if (!column) throw new Error(`${kind} のカラムを作れません`);
        return { type: "deck/add-column", column };
      },
    };
  });

/** 対象を指定せずに実行できる操作と、対象を選ぶ画面への入口。 */
const actions = (): PaletteAction[] => {
  const section = t("signal.sections.action");
  return [
    {
      id: "compose",
      kind: "action",
      title: SHORTCUT_LABELS.compose,
      section,
      keywords: [...t("signal.actions.compose.keywords")],
      shortcodes: ["compose"],
      event: { type: "deck/open-panel", panel: "compose" },
      requiresSignIn: true,
    },
    {
      id: "search",
      kind: "action",
      title: SHORTCUT_LABELS.search,
      section,
      keywords: [...t("signal.actions.search.keywords")],
      shortcodes: ["search"],
      event: { type: "deck/open-panel", panel: "search" },
    },
    {
      id: "add-column",
      kind: "action",
      title: SHORTCUT_LABELS["add-column"],
      section,
      keywords: [...t("signal.actions.addColumn.keywords")],
      shortcodes: ["add-column"],
      event: { type: "deck/open-panel", panel: "add-column" },
    },
    ...columnActions(),
    {
      id: "arrange",
      kind: "action",
      title: t("signal.actions.arrange.title"),
      section,
      keywords: [...t("signal.actions.arrange.keywords")],
      shortcodes: ["arrange"],
      event: { type: "deck/open-panel", panel: "arrange" },
    },
    {
      id: "settings",
      kind: "action",
      title: t("signal.actions.settings.title"),
      section,
      keywords: [...t("signal.actions.settings.keywords")],
      shortcodes: ["settings"],
      event: { type: "deck/open-settings" },
    },
    {
      id: "about",
      kind: "action",
      title: t("signal.actions.about.title"),
      section,
      keywords: [...t("signal.actions.about.keywords")],
      shortcodes: ["about"],
      event: { type: "deck/open-about" },
    },
  ];
};

export const availableActions = (signedIn: boolean): PaletteAction[] =>
  actions().filter((action) => signedIn || !action.requiresSignIn);
