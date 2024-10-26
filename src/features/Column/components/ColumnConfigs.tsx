import { ToggleGroup } from "@kobalte/core/toggle-group";
import type { Component } from "solid-js";
import { useI18n } from "../../../i18n";
import { useColumn } from "../context/column";
import type { ColumnSize } from "../libs/deckSchema";

const ColumnConfigs: Component = () => {
  const t = useI18n();

  const [state, actions] = useColumn() ?? [];

  return (
    <div class="flex justify-between p-1">
      <div class="flex items-center gap-2">
        {t("columnConfig.size.title")}
        <ToggleGroup
          class="b-1 w-fit divide-x rounded"
          value={state?.size}
          onChange={(value) => {
            if (value) {
              actions?.setColumnSize(value as ColumnSize);
            }
          }}
        >
          <ToggleGroup.Item
            class="data-[pressed]:c-white bg-transparent px-2 py-0.5 not-[[data-pressed]]:active:bg-alpha-active not-[[data-pressed]]:not-active:enabled:hover:bg-alpha-hover data-[pressed]:bg-accent-primary"
            value="small"
            aria-label="small"
          >
            {t("columnConfig.size.small")}
          </ToggleGroup.Item>
          <ToggleGroup.Item
            class="data-[pressed]:c-white bg-transparent px-2 py-0.5 not-[[data-pressed]]:active:bg-alpha-active not-[[data-pressed]]:not-active:enabled:hover:bg-alpha-hover data-[pressed]:bg-accent-primary"
            value="medium"
            aria-label="medium"
          >
            {t("columnConfig.size.medium")}
          </ToggleGroup.Item>
          <ToggleGroup.Item
            class="data-[pressed]:c-white bg-transparent px-2 py-0.5 not-[[data-pressed]]:active:bg-alpha-active not-[[data-pressed]]:not-active:enabled:hover:bg-alpha-hover data-[pressed]:bg-accent-primary"
            value="large"
            aria-label="large"
          >
            {t("columnConfig.size.large")}
          </ToggleGroup.Item>
        </ToggleGroup>
      </div>
      <button
        class="flex appearance-none items-center gap-1 bg-transparent"
        type="button"
        onClick={() => {
          actions?.removeThisColumn();
        }}
      >
        <div class="i-material-symbols:delete-outline-rounded c-red-5 aspect-square h-1lh w-auto" />
        {t("columnConfig.remove")}
      </button>
    </div>
  );
};

export default ColumnConfigs;
