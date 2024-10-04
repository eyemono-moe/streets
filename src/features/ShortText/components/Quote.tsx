import type { Component } from "solid-js";
import Text from "./Text";

const Quote: Component<{
  id: string;
}> = (props) => {
  return <Text id={props.id} small />;
};

export default Quote;
