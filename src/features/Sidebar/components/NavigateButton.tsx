import type { Component, ComponentProps } from "solid-js";

const NavigateButton: Component<ComponentProps<"button">> = (props) => {
  return (
    <button class="appearance-none bg-transparent p-1" type="button" {...props}>
      {props.children}
    </button>
  );
};

export default NavigateButton;
