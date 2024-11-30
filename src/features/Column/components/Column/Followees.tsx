import { type Component, For, Show } from "solid-js";
import { useI18n } from "../../../../i18n";
import { useFollowees, useProfile } from "../../../../shared/libs/query";
import ProfileRow from "../../../User/components/ProfileRow";
import type { ColumnContent } from "../../libs/deckSchema";
import { useOpenUserColumn } from "../../libs/useOpenColumn";
import ColumnHeader from "../ColumnHeader";
import TempColumnHeader from "../TempColumnHeader";

const Followees: Component<{
  state: ColumnContent<"followees">;
  isTempColumn?: boolean;
}> = (props) => {
  // const [scrollParent, setScrollParent] = createSignal<HTMLDivElement | null>(
  //   null,
  // );

  const t = useI18n();

  const profile = useProfile(() => props.state.pubkey);
  const followees = useFollowees(() => props.state.pubkey);
  const openUserColumn = useOpenUserColumn();

  // const rowVirtualizer = createMemo(() => {
  //   return createVirtualizer({
  //     count: followees().data?.parsed.followees.length ?? 0,
  //     estimateSize: () => 41,
  //     getScrollElement: scrollParent,
  //     overscan: 5,
  //   });
  // });

  return (
    <div
      class="grid h-full w-full divide-y"
      classList={{
        "grid-rows-[1fr]": props.isTempColumn,
        "grid-rows-[auto_minmax(0,1fr)]": !props.isTempColumn,
      }}
    >
      <Show
        when={props.isTempColumn}
        fallback={
          <ColumnHeader
            title={t("column.followees.title")}
            subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
          />
        }
      >
        <TempColumnHeader
          title={t("column.followees.title")}
          subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
        />
      </Show>
      <div class="b-b-1 h-full w-full overflow-y-auto">
        <For each={followees().data?.parsed.followees}>
          {(followee) => (
            <ProfileRow
              pubkey={followee.pubkey}
              showFollowButton
              onClick={() => openUserColumn(followee.pubkey)}
            />
          )}
        </For>
        <div class="h-50%" />
      </div>
      {/* <div class="h-full w-full overflow-y-auto" ref={setScrollParent}>
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
      </div> */}
    </div>
  );
};

export default Followees;
