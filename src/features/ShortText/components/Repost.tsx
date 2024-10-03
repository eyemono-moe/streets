import type { Component } from "solid-js";
import type { Repost as TRepost } from "../../../libs/parser/6_repost";
import RepostUserName from "./RepostUserName";
import Text from "./Text";

const Repost: Component<{
  repost: TRepost;
}> = (props) => {
  return (
    <div class="p-2">
      <pre>
        <code>{JSON.stringify(props.repost, null, 2)}</code>
      </pre>
      <RepostUserName pubkey={props.repost.pubkey} />
      <Text id={props.repost.tags.find((tag) => tag.kind === "e")?.id} />
      {/* <Show
        when={parsedContent()}
        fallback={
          <Text id={props.repost.tags.find((tag) => tag.kind === "e")?.id} />
        }
      >
        {(nonNullData) => <Text shortText={nonNullData()} />}
      </Show> */}
    </div>
  );
};

export default Repost;
