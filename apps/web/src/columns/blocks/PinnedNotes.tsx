import { pinnedNotesSource } from "@streets/core/deck/column-sources";
import { pinnedNoteIds } from "@streets/core/nostr/pinned-notes";
import type { Component } from "solid-js";
import PinnedNotesView from "../../profile/PinnedNotesView";
import { createBlockSection, useColumnScope } from "../column-scope";

/** その人がピン留めした投稿。無ければ何も出さない（取得中も場所を取らない）。 */
const PinnedNotes: Component<{ pubkey: string }> = (props) => {
  const scope = useColumnScope();
  const section = createBlockSection({
    source: () => pinnedNotesSource(props.pubkey),
    name: "pinned",
  });
  const column = () => scope.column();
  return (
    <PinnedNotesView
      ids={pinnedNoteIds(section.items()[0])}
      size={column().density === "compact" ? "compact" : "normal"}
      expandMedia={column().expandMedia !== false}
    />
  );
};

export default PinnedNotes;
