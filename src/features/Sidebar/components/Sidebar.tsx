import type { Component } from "solid-js";

const Sidebar: Component = () => {
  return (
    <div class="c-zinc-6 grid grid-rows-[auto_1fr_auto] p-1">
      <div class="flex flex-col gap-2">
        <div class="i-material-symbols:edit-square-outline-rounded aspect-square h-auto w-8" />
        <div class="i-material-symbols:search-rounded aspect-square h-auto w-8" />
      </div>
      <div>{/* TODO: 開いているcolumnへのショートカット */}</div>
      <div>
        <div class="i-material-symbols:add-rounded aspect-square h-auto w-8" />
      </div>
    </div>
  );
};

export default Sidebar;
