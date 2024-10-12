import { type Component, Show } from "solid-js";
import { useShortTextByID } from "../../../../shared/libs/query";
import Text from "./Text";

const Reply: Component<{
  id: string;
}> = (props) => {
  const event = useShortTextByID(() => props.id);

  return (
    // TODO: fallback
    <Show when={event().data} keyed>
      {(e) => <Text event={e} small hasChild />}
    </Show>
  );
};

export default Reply;
