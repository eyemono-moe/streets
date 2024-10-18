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
      class="line-height-[1] inline-flex shrink-0 appearance-none items-center justify-center gap-1 rounded-full px-4 py-2 font-700 enabled:cursor-pointer disabled:opacity-50"
      classList={{
        "bg-accent-primary text-white active:bg-accent-active not-active:enabled:hover:bg-accent-hover":
          addedProps.variant === "primary",
        "b-1 bg-transparent active:bg-alpha-active not-active:enabled:hover:bg-alpha-hover":
          addedProps.variant === "border",
        "b-1 b-red-6 bg-transparent text-red-8 active:bg-red-4/40 not-active:enabled:hover:bg-red-4/20 dark:text-red-4":
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
