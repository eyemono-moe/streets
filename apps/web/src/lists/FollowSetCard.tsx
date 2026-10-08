import {
  followSetName,
  mayBeLegacyMuteSet,
  readFollowSet,
} from "@streets/core/lists/follow-set";
import type { NostrEvent } from "@streets/core/nostr/event";
import { type Component, For, Show } from "solid-js";
import Avatar from "../note/Avatar";
import type { EventSize } from "../note/Event";
import { useFollowSets } from "./FollowSetMediator";
import {
  LegacyMuteNotice,
  MEMBER_FACES,
  memberCountLabel,
} from "./FollowSetSummary";
import ListRow from "./ListRow";

/**
 * 流れてきたリスト（kind:30000）。自分のリストは、一覧と同じく復号したものを
 * 使う —— 非公開のメンバーは持ち主にしか読めないので、流れてきたイベントの
 * ままでは非公開の人数が出ない。
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
    <ListRow
      event={props.event}
      size={props.size}
      title={followSetName(set())}
      image={set().image}
      count={memberCountLabel(set())}
      description={set().description}
    >
      {/* 引用の中（compact）は読むためのもので、顔までは並べない。 */}
      <Show when={props.size === "normal" && set().members.length > 0}>
        <span class="flex items-center gap-1" aria-hidden="true">
          <For each={set().members.slice(0, MEMBER_FACES)}>
            {(member) => <Avatar pubkey={member.pubkey} size="tiny" static />}
          </For>
        </span>
      </Show>
      <Show when={mayBeLegacyMuteSet(set())}>
        <LegacyMuteNotice />
      </Show>
    </ListRow>
  );
};

export default FollowSetCard;
