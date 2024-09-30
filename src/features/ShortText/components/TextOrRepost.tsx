import { kinds } from "nostr-tools";
import {
  type Component,
  Match,
  Show,
  Suspense,
  Switch,
  createMemo,
} from "solid-js";
import type { EventTag } from "../../../libs/commonTag";
import { parseShortTextNote, type parseTextNoteOrRepost } from "../event";
import { useQueryShortTextById } from "../query";
import RepostUserName from "./RepostUserName";
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
      return parseShortTextNote(JSON.parse(props.textOrRepost.content));
    } catch {
      return text.data;
    }
  });

  return (
    <div class="p-2">
      <Switch>
        <Match when={props.textOrRepost.kind === kinds.ShortTextNote}>
          <Text
            shortText={
              props.textOrRepost as ReturnType<typeof parseShortTextNote>
            }
            showActions
            showReply
          />
        </Match>
        <Match when={props.textOrRepost.kind === kinds.Repost}>
          <Show when={repostedEvent()}>
            {(nonNullText) => (
              <>
                <RepostUserName pubkey={props.textOrRepost.pubkey} />
                <Suspense>
                  <Text shortText={nonNullText()} showActions />
                </Suspense>
              </>
            )}
          </Show>
        </Match>
      </Switch>
    </div>
  );
};

export default TextOrRepost;
