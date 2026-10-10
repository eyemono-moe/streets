import { type Component, type ComponentProps, splitProps } from "solid-js";
import { Portal as SolidPortal } from "solid-js/web";
import { useAppWindow } from "../app-window";

/**
 * 出し先を、いま描いている窓の body にする Portal。Solid の Portal は既定で元のタブの
 * body に出すので、ピクチャーインピクチャーの中で開いたメニューやダイアログが元のタブに出てしまう。
 */
export const Portal: Component<ComponentProps<typeof SolidPortal>> = (
  props,
) => {
  const win = useAppWindow();
  const [local, rest] = splitProps(props, ["mount"]);
  return <SolidPortal {...rest} mount={local.mount ?? win.document.body} />;
};
