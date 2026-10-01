import { pinnedNotesSource } from "@streets/core/deck/column-sources";
import { pinnedNoteIds } from "@streets/core/nostr/pinned-notes";
import { type Component, createSignal } from "solid-js";
import PinnedNotesView from "../../profile/PinnedNotesView";
import { useDispatch } from "../../ui-events";
import { createBlockSection, useColumnScope } from "../column-scope";

/** その人がピン留めした投稿。無ければ何も出さない（取得中も場所を取らない）。 */
const PinnedNotes: Component<{ pubkey: string }> = (props) => {
  const scope = useColumnScope();
  const dispatch = useDispatch();
  const section = createBlockSection({
    source: () => pinnedNotesSource(props.pubkey),
    name: "pinned",
  });
  const column = () => scope.column();
  // 開閉はその場ですぐ変える。デッキに置いたカラムなら設定として残り、
  // 重ねて開いた一時のカラムでは読み直すまでの間だけ覚える。
  const [open, setOpen] = createSignal(column().pinnedCollapsed !== true);
  return (
    <PinnedNotesView
      ids={pinnedNoteIds(section.items()[0])}
      size={column().density === "compact" ? "compact" : "normal"}
      expandMedia={column().expandMedia !== false}
      open={open()}
      onOpenChange={(next) => {
        setOpen(next);
        dispatch({
          type: "deck/patch-column",
          id: column().id,
          patch: { pinnedCollapsed: !next },
        });
      }}
    />
  );
};

export default PinnedNotes;
