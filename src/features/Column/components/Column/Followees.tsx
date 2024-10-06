import { createVirtualizer } from "@tanstack/solid-virtual";
import { type Component, For, createMemo, createSignal } from "solid-js";
import { useFollowees, useProfile } from "../../../../libs/rxQuery";
import ProfileRow from "../../../Profile/components/ProfileRow";
import type { PickColumnState } from "../../context/deck";
import ColumnHeader from "../ColumnHeader";

const Followees: Component<{
  state: PickColumnState<"followees">;
}> = (props) => {
  const [scrollParent, setScrollParent] = createSignal<HTMLDivElement | null>(
    null,
  );

  const profile = useProfile(() => props.state.pubkey);
  const followees = useFollowees(() => props.state.pubkey);

  const rowVirtualizer = createMemo(() => {
    return createVirtualizer({
      count: followees().data?.parsed.followees.length ?? 0,
      estimateSize: () => 41,
      getScrollElement: scrollParent,
      overscan: 5,
    });
  });

  return (
    <div class="flex w-full flex-col divide-y">
      <ColumnHeader
        name={
          profile().data?.parsed.name
            ? `フォロー中 (@${profile().data?.parsed.name})`
            : "フォロー中"
        }
      />
      <div class="h-full w-full overflow-y-auto" ref={setScrollParent}>
        <div
          class="relative divide-y"
          style={{
            height: `${rowVirtualizer().getTotalSize()}px`,
          }}
        >
          <For each={rowVirtualizer().getVirtualItems()}>
            {(row) => (
              <div
                class="absolute top-0 left-0 w-full"
                style={{
                  height: `${row.size}px`,
                  transform: `translateY(${row.start}px)`,
                }}
              >
                <ProfileRow
                  pubkey={followees().data?.parsed.followees[row.index].pubkey}
                />
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

export default Followees;
