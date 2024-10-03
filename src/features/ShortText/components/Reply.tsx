import type { Component } from "solid-js";
import Text from "./Text";

const Reply: Component<{
  id?: string;
}> = (props) => {
  console.log("Reply", props.id);
  return <Text id={props.id} small isReplyTarget showReply />;
};

export default Reply;
