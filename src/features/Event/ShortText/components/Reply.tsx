import { type Component, Show } from "solid-js";
import Event from "../../../../shared/components/Event";
import { useShortTextByID } from "../../../../shared/libs/query";

const Reply: Component<{
  id: string;
  showReply?: boolean;
}> = (props) => {
  const event = useShortTextByID(() => props.id);

  return (
    // TODO: fallback
    <Show when={event().data} keyed>
      {(e) => <Event event={e} small hasChild showReply={props.showReply} />}
    </Show>
  );
};

export default Reply;
