import { Collapsible } from "@kobalte/core/collapsible";
import type { Component } from "solid-js";
import Logo from "../../../assets/logo.svg";
import { useDialog } from "../../../shared/libs/useDialog";
import ColumnSelector from "../../Column/components/ColumnSelector";
import PostInput from "../../CreatePost/components/PostInput";

const Sidebar: Component = () => {
  const { Dialog: AddColumnDialog, open: openAddColumnDialog } = useDialog();

  return (
    <Collapsible>
      <div class="flex h-full divide-x">
        <div class="c-zinc-6 grid grid-rows-[auto_minmax(0,1fr)_auto]">
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
            <button
              class="appearance-none bg-transparent p-1"
              type="button"
              onClick={openAddColumnDialog}
            >
              <div class="i-material-symbols:add-rounded aspect-square h-auto w-8" />
            </button>
            <AddColumnDialog title="Add Column">
              <ColumnSelector />
            </AddColumnDialog>
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
