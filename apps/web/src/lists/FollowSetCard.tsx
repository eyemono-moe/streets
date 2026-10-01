import { readFollowSet } from "@streets/core/lists/follow-set";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { Component } from "solid-js";
import type { EventSize } from "../note/Event";
import { useFollowSets } from "./FollowSetMediator";
import FollowSetSummary from "./FollowSetSummary";

/**
 * 流れてきたリスト（kind:30000）。リストの一覧の行と同じ形で出す。自分のリストは、
 * 一覧と同じく復号したものを使う —— 非公開のメンバーは持ち主にしか読めないので、
 * 流れてきたイベントのままでは非公開の人数が出ない。
 */
const FollowSetCard: Component<{ event: NostrEvent; size: EventSize }> = (
  props,
) => {
  const own = useFollowSets();
  const set = () => {
    const identifier = readFollowSet(props.event).identifier;
    const decoded =
      own && props.event.pubkey === own.viewer
        ? own.find(identifier)
        : undefined;
    return decoded ?? readFollowSet(props.event);
  };
  return (
    // 引用の中（compact）は外側に枠があるので、枠を重ねない。
    <div
      classList={{
        "rounded-2 border border-primary px-3 py-2.5": props.size === "normal",
      }}
    >
      <FollowSetSummary set={set()} />
    </div>
  );
};

export default FollowSetCard;
