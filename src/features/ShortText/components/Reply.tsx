import { type Component, Show } from "solid-js";
import { useQueryShortTextById } from "../query";
import Text from "./Text";

const Reply: Component<{
  id?: string;
}> = (props) => {
  const text = useQueryShortTextById(() => props.id);

  return (
    <Show when={text.data}>
      {(nonNullData) => (
        <Text shortText={nonNullData()} small isReplyTarget showReply />
      )}
    </Show>
  );
};

export default Reply;
