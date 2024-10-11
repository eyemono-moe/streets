import { createDisclosureState } from "@kobalte/core";
import { Dialog as KDialog } from "@kobalte/core/dialog";
import { type ParentComponent, Show } from "solid-js";
import "../../assets/dialog.css";

export const useDialog = () => {
  const { isOpen, open, close, setIsOpen } = createDisclosureState();

  const Dialog: ParentComponent<{
    title?: string;
  }> = (props) => {
    return (
      <KDialog open={isOpen()} onOpenChange={setIsOpen}>
        <KDialog.Portal>
          <KDialog.Overlay class="fixed inset-0 animate-duration-100 animate-fade-out bg-black/20 data-[expanded]:animate-duration-100 data-[expanded]:animate-fade-in" />
          <div class="fixed inset-0 grid place-items-center p-16">
            <KDialog.Content class="b-1 relative grid max-h-full min-h-[min(100%,18rem)] min-w-[min(100%,24rem)] animate-[contentHide] animate-duration-100 grid-rows-[auto_minmax(0,1fr)] rounded-2 bg-white p-2 shadow data-[expanded]:animate-[contentShow] data-[expanded]:animate-duration-100">
              <div class="flex items-center">
                <Show when={props.title}>
                  <KDialog.Title class="font-500">{props.title}</KDialog.Title>
                </Show>
                <KDialog.CloseButton class="c-zinc-6 ml-auto appearance-none rounded-full bg-transparent p-1 enabled:hover:bg-zinc-3/50">
                  <div class="i-material-symbols:close-rounded aspect-square h-6 w-auto" />
                </KDialog.CloseButton>
              </div>
              <KDialog.Description as="div" class="overflow-auto">
                {props.children}
              </KDialog.Description>
            </KDialog.Content>
          </div>
        </KDialog.Portal>
      </KDialog>
    );
  };

  return { Dialog, open, close };
};
