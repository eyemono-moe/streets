import { Dialog } from "@kobalte/core/dialog";
import { useLocation } from "@solidjs/router";
import { type ParentComponent, Show } from "solid-js";
import Columns from "../features/Column/components/Columns";
import { useDeck } from "../features/Column/context/deck";
import Navbar from "../features/Sidebar/components/Navbar";
import Sidebar from "../features/Sidebar/components/Sidebar";

const Root: ParentComponent = (props) => {
  const location = useLocation();
  const [, , layout] = useDeck();

  return (
    <Show
      when={layout() === "horizontal"}
      fallback={
        <div class="grid-col-[minmax(0,1fr)_auto] grid h-100dvh w-screen divide-y-2">
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
    </Show>
  );
};

export default Root;
