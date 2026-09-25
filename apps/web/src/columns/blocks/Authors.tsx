import { followersFrom } from "@streets/core/nostr/follow-list";
import type { NostrSource } from "@streets/core/read/source";
import type { Component } from "solid-js";
import ProfileList from "../../profile/ProfileList";
import { createBlockSection } from "../column-scope";

/** 取ったイベントの書き手を、重ねずに人の一覧にする。 */
const Authors: Component<{
  source: () => NostrSource | undefined;
  /** 取り終えて誰もいなかったときの一文。 */
  empty: string;
}> = (props) => {
  const section = createBlockSection({ source: () => props.source() });
  return (
    <ProfileList
      people={followersFrom(section.items())}
      settled={section.status().phase === "settled"}
      empty={props.empty}
    />
  );
};

export default Authors;
