import { Collapsible } from "@kobalte/core/collapsible";
import { type Component, For, Match, Switch } from "solid-js";
import { Portal } from "solid-js/web";
import type { CacheDataBase } from "../../context/eventCache";

const EventCacheDevTools: Component<{
  cache: { [key: string]: CacheDataBase | undefined };
}> = (props) => {
  return (
    <Portal>
      <div class="fixed top-0 right-0 bottom-0 max-w-100 resize-x overflow-hidden border bg-white p-2">
        <div class="b-1 h-full w-full divide-y overflow-auto">
          <For each={Object.entries(props.cache)}>
            {([key, cache]) => (
              <Collapsible>
                <Collapsible.Trigger class="flex appearance-none items-center gap-1 bg-transparent">
                  <Switch
                    fallback={
                      <div class="i-material-symbols:help-rounded c-zinc h-4 w-4" />
                    }
                  >
                    <Match when={cache?.data}>
                      <div class="i-material-symbols:check-circle-rounded c-green h-4 w-4" />
                    </Match>
                    <Match when={cache?.isFetching}>
                      <div class="i-material-symbols:change-circle-rounded c-zinc h-4 w-4" />
                    </Match>
                    <Match when={cache?.isInvalidated}>
                      <div class="i-material-symbols:error-circle-rounded-sharp c-yellow h-4 w-4" />
                    </Match>
                  </Switch>
                  <div class="text-3 text-zinc-5">{key}</div>
                </Collapsible.Trigger>
                <Collapsible.Content class="flex flex-col text-3">
                  <pre>{JSON.stringify(cache?.data, null, 2)}</pre>
                  <div>
                    updatedAt:
                    {cache?.dataUpdatedAt
                      ? new Date(cache?.dataUpdatedAt).toLocaleString()
                      : "----"}
                  </div>
                  <div>staleTime: {cache?.staleTime}</div>
                </Collapsible.Content>
              </Collapsible>
            )}
          </For>
        </div>
      </div>
    </Portal>
  );
};

export default EventCacheDevTools;
