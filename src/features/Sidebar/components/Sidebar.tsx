import { Collapsible } from "@kobalte/core/collapsible";
import type { Component } from "solid-js";
import Logo from "../../../assets/logo.svg";
import PostInput from "../../ShortText/components/PostInput";

const Sidebar: Component = () => {
  return (
    <Collapsible>
      <div class="flex h-full divide-x">
        <div class="c-zinc-6 grid grid-rows-[auto_1fr_auto]">
          <div class="flex flex-col">
            <Collapsible.Trigger class="appearance-none bg-transparent p-1">
              <div class="i-material-symbols:edit-square-outline-rounded aspect-square h-auto w-8" />
            </Collapsible.Trigger>
            <button class="appearance-none bg-transparent p-1" type="button">
              <div class="i-material-symbols:search-rounded aspect-square h-auto w-8" />
            </button>
          </div>
          <div>{/* TODO: 開いているcolumnへのショートカット */}</div>
          <div class="flex flex-col">
            <button class="appearance-none bg-transparent p-1" type="button">
              <div class="i-material-symbols:add-rounded aspect-square h-auto w-8" />
            </button>
            <button class="appearance-none bg-transparent p-1" type="button">
              <img
                src={Logo}
                alt="strands logo"
                class="aspect-square h-auto w-8"
              />
            </button>
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
