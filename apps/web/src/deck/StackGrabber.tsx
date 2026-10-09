import { Drawer } from "@ark-ui/solid/drawer";
import type { Component } from "solid-js";

/**
 * 重ねたカラムの上端に出す、つまんで下ろすためのハンドル。
 * カラムの見出しの上に独立した行として置く。見出しに重ねると、戻る・閉じるの
 * ボタンの当たりを奪い、見出しをつまむ操作とも見分けがつかなくなる。
 */
const StackGrabber: Component = () => (
  <Drawer.Grabber class="flex h-4 w-full shrink-0 cursor-grab items-center justify-center active:cursor-grabbing">
    <Drawer.GrabberIndicator class="block h-1 w-10 rounded-full bg-ui-3 dark:bg-ui-6" />
  </Drawer.Grabber>
);

export default StackGrabber;
