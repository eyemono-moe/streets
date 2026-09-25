import { columnTitle } from "@streets/core/deck/column-kinds";
import type { ColumnDef } from "@streets/core/deck/deck";
import { profileLabel } from "@streets/core/nostr/profile";
import { type Accessor, type Component, Show } from "solid-js";
import Name from "../note/Name";
import { useProfile } from "../note/use-profile";

/**
 * カラムの題名の文字。中身から決め、人に紐づくカラムは kind:0 が届いたら npub では
 * なく名前で呼ぶ。ヘッダー・タブ・「〜に戻る」・読み上げの名前など、題名を出す
 * どこでもこれを使う（保存した `title` をそのまま出さない）。
 */
export const useColumnTitle = (
  column: Accessor<ColumnDef>,
): Accessor<string> => {
  const title = () => columnTitle(column());
  const person = () => {
    const current = title();
    return "person" in current ? current.person : undefined;
  };
  const profile = useProfile(person);
  return () => {
    const current = title();
    return "person" in current
      ? `${profileLabel(profile(), current.person)}${current.suffix}`
      : current.text;
  };
};

const ColumnTitle: Component<{ column: ColumnDef }> = (props) => {
  const title = useColumnTitle(() => props.column);
  const parts = () => columnTitle(props.column);
  const person = () => {
    const current = parts();
    return "person" in current ? current : undefined;
  };
  return (
    <Show when={person()} fallback={title()}>
      {(current) => (
        <>
          <Name pubkey={current().person} />
          {current().suffix}
        </>
      )}
    </Show>
  );
};

export default ColumnTitle;
