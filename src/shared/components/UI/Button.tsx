import {
  type Component,
  type ComponentProps,
  mergeProps,
  splitProps,
} from "solid-js";

const Button: Component<
  ComponentProps<"button"> & {
    variant?: "primary" | "border" | "dangerBorder";
    full?: boolean;
  }
> = (props) => {
  const withDefault = mergeProps(
    { type: "button", variant: "primary", full: false } as const,
    props,
  );
  const [addedProps, buttonProps] = splitProps(withDefault, [
    "variant",
    "full",
  ]);

  return (
    <button
      {...buttonProps}
      class="inline-flex cursor-pointer appearance-none items-center justify-center gap-1 rounded-full px-4 py-1 font-700 disabled:cursor-not-allowed disabled:opacity-50"
      classList={{
        "bg-purple-8 enabled:hover:bg-purple-7 text-white":
          addedProps.variant === "primary",
        "b-1 bg-white text-zinc-9 enabled:hover:bg-zinc-1":
          addedProps.variant === "border",
        "b-1 b-red-3 bg-white text-red-9 enabled:hover:bg-red-1":
          addedProps.variant === "dangerBorder",
        "w-fit": !addedProps.full,
        "w-full": addedProps.full,
      }}
    >
      {props.children}
    </button>
  );
};

export default Button;
