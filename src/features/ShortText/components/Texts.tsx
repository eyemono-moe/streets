import { type Component, For } from "solid-js";
import { pickLatestEvent, sortEvents } from "../../../libs/latestEvent";
import { useQueryPubKey } from "../../../libs/useNIP07";
import { useQueryFollowList, useQueryShortText } from "../query";
import Text from "./Text";

const Texts: Component = () => {
  const pubKey = useQueryPubKey();
  const follows = useQueryFollowList(() => pubKey.data);
  const followPubKeys = () =>
    pickLatestEvent(follows.data ?? [])?.tags.map((tag) => tag[1]);

  const texts = useQueryShortText(followPubKeys);
  const sortedTexts = () => sortEvents(texts.data ?? []);

  return (
    <div class="divide-y">
      <For each={sortedTexts()}>{(text) => <Text shortText={text} />}</For>
    </div>
  );
};

export default Texts;
