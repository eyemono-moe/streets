import { Tabs } from "@ark-ui/solid/tabs";
import { type Component, For, type JSX, Show } from "solid-js";

export type ColumnTab = {
  value: string;
  label: string;
  count?: number;
  content: () => JSX.Element;
};

/**
 * カラム内の表示を、横幅を増やさず切り替えるタブ。開いていないタブの中身は
 * 作らない（購読も張らない）ので、戻ると取り直しになる。
 */
const ColumnTabs: Component<{
  tabs: readonly ColumnTab[];
  label: string;
  defaultValue?: string;
  /**
   * `inner` はタブの中身だけをスクロールする（タブがカラムの全体を占めるとき）。
   * `column` は上にあるもの（プロフィールなど）ごとカラムでスクロールし、
   * タブの並びは上端に留める。
   */
  scroll?: "inner" | "column";
}> = (props) => (
  <Tabs.Root
    defaultValue={props.defaultValue ?? props.tabs[0]?.value}
    lazyMount
    unmountOnExit
    class="isolate flex flex-col"
    classList={{ "h-full min-h-0 flex-1": props.scroll !== "column" }}
  >
    <Tabs.List
      aria-label={props.label}
      // 後に並ぶ中身（仮想スクロールの行は transform で重なりを作る）より上に出す。
      // Root を isolate で区切っているので、この重なりは外へ漏れない。
      class="flex min-w-0 overflow-x-auto border-primary border-b bg-primary px-2"
      // sticky も位置を持つので、下線の Indicator はどちらでも List に合わせて置ける。
      classList={{
        relative: props.scroll !== "column",
        "sticky top-0 z-1": props.scroll === "column",
      }}
    >
      <For each={props.tabs}>
        {(tab) => (
          <Tabs.Trigger
            value={tab.value}
            class="c-secondary hover:c-primary data-[selected]:c-accent-5 flex h-10 min-w-0 flex-1 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap bg-transparent px-2 font-600 text-caption outline-none focus-visible:ring-2 focus-visible:ring-accent-5"
          >
            <span>{tab.label}</span>
            <Show when={tab.count !== undefined}>
              <span class="tabular-nums">{tab.count}</span>
            </Show>
          </Tabs.Trigger>
        )}
      </For>
      <Tabs.Indicator class="absolute bottom-0 flex h-0.5 w-[var(--width)] items-center justify-center">
        <span class="h-0.5 w-6 rounded-full bg-accent-primary" />
      </Tabs.Indicator>
    </Tabs.List>
    <For each={props.tabs}>
      {(tab) => (
        <Tabs.Content
          value={tab.value}
          class="outline-none"
          classList={{
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain":
              props.scroll !== "column",
          }}
        >
          {tab.content()}
        </Tabs.Content>
      )}
    </For>
  </Tabs.Root>
);

export default ColumnTabs;
