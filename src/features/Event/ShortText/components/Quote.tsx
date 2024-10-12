import { type Component, Show } from "solid-js";
import Event from "../../../../shared/components/Event";
import { useEventByID } from "../../../../shared/libs/query";

const Quote: Component<{
  id: string;
}> = (props) => {
  const event = useEventByID(() => props.id);

  return (
    // TODO: fallback
    <Show when={event().data} keyed>
      {(e) => <Event event={e} small />}
    </Show>
  );
};

export default Quote;
