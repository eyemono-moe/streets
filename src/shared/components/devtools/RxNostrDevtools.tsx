import { createDraggable } from "@neodrag/solid";
import { For } from "solid-js";
import { useRxNostr } from "../../../context/rxNostr";

const RxNostrDevtools = () => {
  const { connectionState } = useRxNostr();

  // @ts-ignore: TS6133 typescript can't detect use: directive
  const { draggable } = createDraggable();

  return (
    <div class="pointer-events-none fixed right-0 bottom-0 w-fit p-10">
      <div
        use:draggable={{
          bounds: "body",
        }}
        class="pointer-events-auto w-fit rounded bg-white/75 p-2 shadow backdrop-blur"
      >
        rxNostr ConnectionState
        <div class="b-1 grid divide-y">
          <div class="grid-col-span-2 grid grid-cols-subgrid divide-x">
            <div class="p-1">relay</div>
            <div class="p-1">state</div>
          </div>
          <For each={Object.entries(connectionState)}>
            {([relay, state]) => (
              <div class="grid-col-span-2 grid grid-cols-subgrid divide-x">
                <div class="p-1">{relay}</div>
                <div class="p-1">{state}</div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

export default RxNostrDevtools;
