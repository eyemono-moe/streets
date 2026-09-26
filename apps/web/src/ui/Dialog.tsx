import { Dialog as ArkDialog } from "@ark-ui/solid/dialog";
import {
  type Component,
  type JSX,
  type ParentComponent,
  splitProps,
} from "solid-js";
import { Portal } from "solid-js/web";
import IconButton from "./IconButton";

export const DialogRoot: ParentComponent<{
  open: boolean;
  onClose: () => void;
}> = (props) => (
  <ArkDialog.Root
    open={props.open}
    onOpenChange={(details) => !details.open && props.onClose()}
    lazyMount
    unmountOnExit
  >
    {props.children}
  </ArkDialog.Root>
);

export const DialogPortal: ParentComponent<{
  class?: string;
  /** 背景の色。既定は、後ろの画面が透けて見える薄い暗さ。 */
  backdropClass?: string;
  classList?: Record<string, boolean | undefined>;
}> = (props) => (
  <Portal>
    <ArkDialog.Backdrop
      class={`motion-fade fixed inset-0 ${props.backdropClass ?? "bg-ui-950/40"}`}
    />
    <ArkDialog.Positioner
      class={`fixed inset-0 grid place-items-center ${props.class ?? "p-4"}`}
      classList={props.classList}
    >
      {props.children}
    </ArkDialog.Positioner>
  </Portal>
);

export const DialogContent: ParentComponent<
  JSX.HTMLAttributes<HTMLDivElement>
> = (props) => {
  const [own, rest] = splitProps(props, ["class", "children"]);
  return (
    <ArkDialog.Content
      class={`motion-pop c-primary overflow-hidden bg-primary outline-none ${own.class ?? ""}`}
      {...rest}
    >
      {own.children}
    </ArkDialog.Content>
  );
};

/** ダイアログの見出しに置く「閉じる」。 */
export const DialogClose: Component<{
  disabled?: boolean;
  /** 読み上げの名前。何を閉じるのかを言いたいとき。 */
  label?: string;
  class?: string;
}> = (props) => (
  <ArkDialog.CloseTrigger
    asChild={(trigger) => (
      <IconButton
        {...trigger()}
        variant="filled"
        size="md"
        icon="i-material-symbols:close-rounded"
        label={props.label ?? "閉じる"}
        disabled={props.disabled}
        class={props.class}
      />
    )}
  />
);

export const DialogTitle = ArkDialog.Title;
export const DialogDescription = ArkDialog.Description;
