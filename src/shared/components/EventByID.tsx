import { type Component, Show } from "solid-js";
import { useEventByID } from "../libs/query";
import Event from "./Event";

const EventByID: Component<{
  id: string;
  small?: boolean;
  showReactions?: boolean;
  showActions?: boolean;
}> = (props) => {
  const event = useEventByID(() => props.id);

  return (
    // TODO: fallback
    <Show when={event().data} keyed>
      {(e) => (
        <Event
          event={e}
          small={props.small}
          showReactions={props.showReactions}
          showActions={props.showActions}
        />
      )}
    </Show>
  );
};

export default EventByID;
