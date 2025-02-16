import { type Component, Show } from "solid-js";
import { useI18n } from "../../../i18n";
import { useColumn } from "../context/column";

const TempColumnHeader: Component<{
  title?: string;
  subTitle?: string;
  showScrollToTop?: boolean;
  onClickScrollToTop?: () => void;
}> = (props) => {
  const t = useI18n();

  const [, { closeTempColumn, backOrCloseTempColumn, transferTempColumn }] =
    // biome-ignore lint/style/noNonNullAssertion: Column component is always rendered inside ColumnProvider
    useColumn()!;

  return (
    <div class="relative flex items-center gap-1 p-1">
      <button
        type="button"
        class="c-secondary appearance-none rounded-full bg-transparent p-1 enabled:hover:bg-alpha-hover enabled:hover:bg-opacity-50"
        onClick={backOrCloseTempColumn}
      >
        <div class="i-material-symbols:chevron-left-rounded aspect-square h-6 w-auto" />
      </button>
      <div class="flex items-baseline justify-start truncate py-3px">
        <div class="truncate font-500">{props.title}</div>
        <div class="c-secondary ml-1 truncate text-caption">
          {props.subTitle}
        </div>
      </div>
      <button
        type="button"
        class="c-secondary ml-auto appearance-none rounded-full bg-transparent p-1 enabled:hover:bg-alpha-hover enabled:hover:bg-opacity-50"
        onClick={transferTempColumn}
        title={t("column.openInNextColumn")}
      >
        <div class="i-material-symbols:open-in-new-rounded aspect-square h-6 w-auto" />
      </button>
      <button
        type="button"
        class="c-secondary appearance-none rounded-full bg-transparent p-1 enabled:hover:bg-alpha-hover enabled:hover:bg-opacity-50"
        onClick={closeTempColumn}
      >
        <div class="i-material-symbols:close-rounded aspect-square h-6 w-auto" />
      </button>
      <Show when={props.showScrollToTop}>
        <button
          class="absolute inset-0 h-full w-50% translate-x-50%"
          style={{
            background:
              "radial-gradient(50% 50% at 50% 100%, var(--theme-accent-color) 0%, transparent 100%)",
          }}
          type="button"
          aria-label="scroll to top"
          onClick={props.onClickScrollToTop}
        />
      </Show>
    </div>
  );
};

export default TempColumnHeader;
