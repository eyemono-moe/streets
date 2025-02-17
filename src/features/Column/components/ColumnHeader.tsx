import { Collapsible } from "@kobalte/core/collapsible";
import { type JSX, type ParentComponent, Show } from "solid-js";
import { useColumn } from "../context/column";
import { columnIcon } from "../libs/columnIcon";
import ColumnConfigs from "./ColumnConfigs";
import "../../../assets/collapsible.css";

const ColumnHeader: ParentComponent<{
  title?: string;
  subTitle?: string;
  overrideContent?: JSX.Element;
  showScrollToTop?: boolean;
  onClickScrollToTop?: () => void;
}> = (props) => {
  const [state] = useColumn() ?? [];

  return (
    <Collapsible class="divide-y">
      <div class="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 p-1 pl-9.5">
        <div
          class={`${state?.content.type ? columnIcon(state?.content.type) : ""} c-secondary aspect-square h-6 w-auto`}
        />
        <Show
          when={props.overrideContent}
          fallback={
            // Search columnのinputに合わせるために3pxのpaddingを追加
            <div class="flex items-baseline justify-start truncate py-3px">
              <div class="truncate font-500">{props.title}</div>
              <div class="c-secondary ml-1 truncate text-caption">
                {props.subTitle}
              </div>
            </div>
          }
        >
          {props.overrideContent}
        </Show>
        <Collapsible.Trigger class="appearance-none rounded-full bg-transparent hover:bg-alpha-hover">
          <div
            class={
              "i-material-symbols:page-info-outline-rounded c-secondary aspect-square h-6 w-auto"
            }
          />
        </Collapsible.Trigger>
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
      <Collapsible.Content class="data-[closed] animate-[slideUp] animate-duration-100 divide-y overflow-hidden data-[expanded]:animate-[slideDown] data-[expanded]:animate-duration-100">
        {props.children}
        <ColumnConfigs />
      </Collapsible.Content>
    </Collapsible>
  );
};

export default ColumnHeader;
