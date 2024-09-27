import { type Component, Match, Switch, createMemo } from "solid-js";
import type { EventTag } from "../../../libs/commonTag";
import type { parseShortTextNote, parseTextNoteOrRepost } from "../event";
import { useQueryShortTextById } from "../query";
import Text from "./Text";

const TextOrRepost: Component<{
  textOrRepost: ReturnType<typeof parseTextNoteOrRepost>;
}> = (props) => {
  const targetId = () => {
    // contentのパースに成功したらそのcontentを使うため、subscribeしないようにする
    try {
      JSON.parse(props.textOrRepost.content);
      return;
    } catch {
      return (
        props.textOrRepost.tags.find((tag) => tag.kind === "e") as
          | EventTag
          | undefined
      )?.id;
    }
  };
  const text = useQueryShortTextById(targetId);

  const repostedEvent = createMemo(() => {
    try {
      // TODO: valibotでパースする
      return JSON.parse(props.textOrRepost.content) as ReturnType<
        typeof parseShortTextNote
      >;
    } catch {
      return text.data;
    }
  });

  return (
    <Switch fallback={<div>Unknown</div>}>
      <Match when={props.textOrRepost.kind === "ShortTextNote"}>
        <Text
          shortText={
            props.textOrRepost as ReturnType<typeof parseShortTextNote>
          }
        />
      </Match>
      <Match when={props.textOrRepost.kind === "Repost" && repostedEvent()}>
        {(nonNullText) => (
          <Text
            shortText={nonNullText()}
            repostBy={props.textOrRepost.pubkey}
          />
        )}
      </Match>
    </Switch>
  );
};

export default TextOrRepost;
