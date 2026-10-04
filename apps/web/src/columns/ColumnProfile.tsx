import { Collapsible } from "@ark-ui/solid/collapsible";
import {
  type ParentComponent,
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";

/** カラムのプロフィール。見出しのボタンは枠の外にあるので、開閉は外から受け取る。 */
const ColumnProfile: ParentComponent<{ id: string; open: boolean }> = (
  props,
) => {
  const [mounted, setMounted] = createSignal(props.open);
  createEffect(() => {
    if (props.open) {
      setMounted(true);
      return;
    }
    // Ark の閉じる動きを見せてから、プロフィールの購読を片付ける。
    const timer = setTimeout(() => setMounted(false), 180);
    onCleanup(() => clearTimeout(timer));
  });
  return (
    <Collapsible.Root open={props.open} lazyMount unmountOnExit>
      <Collapsible.Content
        id={`column-profile-${props.id}`}
        class="motion-collapse"
      >
        <Show when={mounted()}>{props.children}</Show>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

export default ColumnProfile;
