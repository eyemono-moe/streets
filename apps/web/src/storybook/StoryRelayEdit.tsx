import { setRelayList } from "@streets/core/nostr/build/relay-list";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import { type ParentComponent, createSignal } from "solid-js";
import { RelayMediator } from "../settings/RelayMediator";
import { createStoryAuthor } from "./story-events";

const viewer = createStoryAuthor(95);

/**
 * 自分のリレーの設定を持った段。足した・変えたリレーは、保存したものとして
 * 手元の版に当てる（アプリと同じく少し待ってから）。
 */
export const StoryRelayEdit: ParentComponent<{
  own: readonly RelayListEntry[];
}> = (props) => {
  const [relayList, setRelayListEvent] = createSignal<NostrEvent>(
    viewer.event(setRelayList([...props.own])(undefined)),
  );
  return (
    <RelayMediator
      writer={{
        replace: async (_kind, _identifier, mutate) => {
          const event = viewer.event(await mutate(relayList()));
          setRelayListEvent(event);
          return { event, accepted: [], rejected: [] };
        },
      }}
      relayList={relayList}
      settled={() => true}
      statusOf={() => "idle"}
      infoOf={() => undefined}
    >
      {props.children}
    </RelayMediator>
  );
};
