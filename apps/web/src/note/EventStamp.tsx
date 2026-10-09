import type { NostrEvent } from "@streets/core/nostr/event";
import {
  formatEventTime,
  formatEventTimeFull,
} from "@streets/core/view/format-time";
import { type Component, Show } from "solid-js";
import type { EventSize } from "./Event";
import EventMenu from "./EventMenu";

/** 見出しの右端に置く、出した時刻とメニュー。 */
const EventStamp: Component<{
  event: NostrEvent;
  size: EventSize;
  withActions?: boolean;
}> = (props) => {
  const date = () => new Date(props.event.created_at * 1000);
  return (
    <>
      <time
        class="c-secondary text-caption"
        datetime={date().toISOString()}
        title={formatEventTimeFull(date())}
      >
        {formatEventTime(date(), new Date())}
      </time>
      {/* 引用の中（compact）には出さない。開いた先で操作する。 */}
      <Show when={props.size === "normal"}>
        <EventMenu event={props.event} withActions={props.withActions} />
      </Show>
    </>
  );
};

export default EventStamp;
