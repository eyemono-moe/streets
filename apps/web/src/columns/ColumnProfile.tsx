import { Collapsible } from "@ark-ui/solid/collapsible";
import type { ParentComponent } from "solid-js";

/** カラムのプロフィール。見出しのボタンは枠の外にあるので、開閉は外から受け取る。 */
const ColumnProfile: ParentComponent<{ id: string; open: boolean }> = (
  props,
) => (
  // id は ids で渡す。Content に直に付けると、Ark が高さを測る要素を見失い、開閉が動かない。
  <Collapsible.Root
    open={props.open}
    ids={{ content: `column-profile-${props.id}` }}
    lazyMount
    unmountOnExit
  >
    <Collapsible.Content class="motion-collapse">
      {props.children}
    </Collapsible.Content>
  </Collapsible.Root>
);

export default ColumnProfile;
