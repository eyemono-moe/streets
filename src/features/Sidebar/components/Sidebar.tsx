import { Collapsible } from "@kobalte/core/collapsible";
import type { Component } from "solid-js";
import PostInput from "../../ShortText/components/PostInput";

const Sidebar: Component = () => {
  return (
    <Collapsible defaultOpen>
      <div class="flex h-full divide-x">
        <div class="c-zinc-6 grid grid-rows-[auto_1fr_auto] p-1">
          <div class="flex flex-col gap-2">
            <Collapsible.Trigger>
              <div class="i-material-symbols:edit-square-outline-rounded aspect-square h-auto w-8" />
            </Collapsible.Trigger>
            <div class="i-material-symbols:search-rounded aspect-square h-auto w-8" />
          </div>
          <div>{/* TODO: 開いているcolumnへのショートカット */}</div>
          <div>
            <div class="i-material-symbols:add-rounded aspect-square h-auto w-8" />
          </div>
        </div>
        <Collapsible.Content>
          <div class="h-full w-80 overflow-auto">
            <PostInput />
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible>
  );
};

export default Sidebar;
