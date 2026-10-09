import type { NostrEvent } from "@streets/core/nostr/event";
import { type Component, Show } from "solid-js";
import type { EventSize } from "./Event";
import EventMenu from "./EventMenu";
import EventTime from "./EventTime";

/** 見出しの右端に置く、出した時刻とメニュー。 */
const EventStamp: Component<{
  event: NostrEvent;
  size: EventSize;
  withActions?: boolean;
}> = (props) => {
  const date = () => new Date(props.event.created_at * 1000);
  return (
    <>
      <EventTime at={date()} />
      {/* 引用の中（compact）には出さない。開いた先で操作する。 */}
      <Show when={props.size === "normal"}>
        <EventMenu event={props.event} withActions={props.withActions} />
      </Show>
    </>
  );
};

export default EventStamp;
