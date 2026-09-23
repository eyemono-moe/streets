import { Tabs } from "@ark-ui/solid/tabs";
import { type Component, For, type JSX, Show } from "solid-js";

export type ColumnTab = {
  value: string;
  label: string;
  count?: number;
  content: () => JSX.Element;
};

/** カラム内の表示を、横幅を増やさず切り替えるタブ。 */
const ColumnTabs: Component<{
  tabs: readonly ColumnTab[];
  label: string;
  defaultValue?: string;
}> = (props) => (
  <Tabs.Root
    defaultValue={props.defaultValue ?? props.tabs[0]?.value}
    lazyMount
    unmountOnExit
    class="flex h-full min-h-0 flex-1 flex-col"
  >
    <Tabs.List
      aria-label={props.label}
      class="relative flex min-w-0 overflow-x-auto border-primary border-b bg-primary px-2"
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
          class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain outline-none"
        >
          {tab.content()}
        </Tabs.Content>
      )}
    </For>
  </Tabs.Root>
);

export default ColumnTabs;
