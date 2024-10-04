import type { Component } from "solid-js";
import type { Repost as TRepost } from "../../../libs/parser/6_repost";
import RepostUserName from "./RepostUserName";
import Text from "./Text";

const Repost: Component<{
  repost: TRepost;
}> = (props) => {
  return (
    <div class="p-2">
      <RepostUserName pubkey={props.repost.pubkey} />
      <Text
        id={props.repost.targetEventID}
        relay={props.repost.parsedContent?.tags
          .filter((tag) => tag.kind === "e" && !!tag.relay)
          // @ts-ignore
          // biome-ignore lint/style/noNonNullAssertion: filterでundefinedを除外しているため
          .map((tag) => tag.relay!)}
        showActions
      />
    </div>
  );
};

export default Repost;
