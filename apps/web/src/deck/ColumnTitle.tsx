import { columnTitle } from "@streets/core/deck/column-title";
import type { ColumnDef } from "@streets/core/deck/deck";
import { profileLabel } from "@streets/core/nostr/profile";
import type { Accessor, Component } from "solid-js";
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
  return <>{title()}</>;
};

export default ColumnTitle;
