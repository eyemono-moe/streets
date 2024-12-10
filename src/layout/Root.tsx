import { Dialog } from "@kobalte/core/dialog";
import { useLocation } from "@solidjs/router";
import { type ParentComponent, Show } from "solid-js";
import Columns from "../features/Column/components/Columns";
import { useDeck } from "../features/Column/context/deck";
import Navbar from "../features/Sidebar/components/Navbar";
import Sidebar from "../features/Sidebar/components/Sidebar";
import PublishingIndicators from "../shared/components/UI/PublishingIndicator";

const Root: ParentComponent = (props) => {
  const location = useLocation();
  const [state, , layout] = useDeck();

  return (
    <Show
      when={layout() === "horizontal"}
      fallback={
        <div class="grid h-100dvh w-screen grid-rows-[minmax(0,1fr)_auto] divide-y-2">
          <Columns />
          <Navbar />
          <Dialog open={location.pathname !== "/"}>
            <Dialog.Portal>
              <Dialog.Overlay class="fixed inset-0" />
              <div class="fixed inset-0">
                <Dialog.Content class="h-full w-full bg-primary">
                  {props.children}
                </Dialog.Content>
              </div>
            </Dialog.Portal>
          </Dialog>
        </div>
      }
    >
      <div class="flex h-svh w-screen divide-x">
        <Sidebar />
        <div
          class="relative h-full shrink-0 overflow-auto transition-width duration-100"
          classList={{
            "w-0 b-x-0!": location.pathname === "/",
            "w-100": location.pathname !== "/",
          }}
        >
          <div class="absolute right-0 h-full w-100 overflow-y-auto">
            {props.children}
          </div>
        </div>
        <Columns />
      </div>
      <Show when={state.display.showLoading}>
        <div class="pointer-events-none absolute right-0 bottom-1">
          <PublishingIndicators />
        </div>
      </Show>
    </Show>
  );
};

export default Root;
