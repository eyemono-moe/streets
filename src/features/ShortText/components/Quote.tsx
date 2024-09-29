import { type Component, Show } from "solid-js";
import { useQueryShortTextById } from "../query";
import Text from "./Text";

const Quote: Component<{
  id?: string;
}> = (props) => {
  const text = useQueryShortTextById(() => props.id);

  return (
    <Show when={text.data}>
      {(nonNullData) => <Text shortText={nonNullData()} small />}
    </Show>
  );
};

export default Quote;
