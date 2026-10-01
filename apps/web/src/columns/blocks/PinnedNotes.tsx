import { pinnedNotesSource } from "@streets/core/deck/column-sources";
import { pinnedNoteIds } from "@streets/core/nostr/pinned-notes";
import type { Component } from "solid-js";
import PinnedNotesView from "../../profile/PinnedNotesView";
import { createBlockSection, useColumnScope } from "../column-scope";

export type PinnedNotes = {
  ids: () => readonly string[];
  settled: () => boolean;
};

/**
 * その人がピン留めした投稿の一覧（kind:10001）を読む。タブの件数に使うので、
 * タブを開く前から読む（最新の 1 件だけなので軽い）。
 */
export const createPinnedNotes = (pubkey: () => string): PinnedNotes => {
  const section = createBlockSection({
    source: () => pinnedNotesSource(pubkey()),
    name: "pinned",
  });
  return {
    ids: () => pinnedNoteIds(section.items()[0]),
    settled: () => section.status().phase === "settled",
  };
};

/** 「ピン留め」タブの中身。 */
const PinnedNotesTab: Component<{ pinned: PinnedNotes }> = (props) => {
  const scope = useColumnScope();
  const column = () => scope.column();
  return (
    <PinnedNotesView
      ids={props.pinned.ids()}
      settled={props.pinned.settled()}
      size={column().density === "compact" ? "compact" : "normal"}
      expandMedia={column().expandMedia !== false}
    />
  );
};

export default PinnedNotesTab;
