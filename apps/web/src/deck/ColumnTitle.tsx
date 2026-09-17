import type { ColumnDef, ColumnSource } from "@streets/core/deck/deck";
import { profileLabel } from "@streets/core/nostr/profile";
import { type Component, Match, Switch } from "solid-js";
import { useProfile } from "../note/use-profile";

/** その人に紐づくカラムなら、題名に使う pubkey と付ける語。 */
const personOf = (
  source: ColumnSource,
): { pubkey: string; suffix: string } | undefined => {
  if (source.kind === "user") return { pubkey: source.pubkey, suffix: "" };
  if (source.kind === "followees-list") {
    return { pubkey: source.pubkey, suffix: " のフォロー" };
  }
  if (source.kind === "followers-list") {
    return { pubkey: source.pubkey, suffix: " のフォロワー" };
  }
  return undefined;
};

const PersonTitle: Component<{ pubkey: string; suffix: string }> = (props) => {
  const profile = useProfile(() => props.pubkey);
  return (
    <>
      {profileLabel(profile(), props.pubkey)}
      {props.suffix}
    </>
  );
};

/**
 * ヘッダーに出す題名。人に紐づくカラムは、kind:0 が届いたら npub ではなく
 * 名前で呼ぶ —— 開いた先に誰がいるのかが、題名だけで分かるようにする。
 */
const ColumnTitle: Component<{ column: ColumnDef }> = (props) => (
  <Switch fallback={props.column.title}>
    <Match when={personOf(props.column.source)}>
      {(person) => (
        <PersonTitle pubkey={person().pubkey} suffix={person().suffix} />
      )}
    </Match>
  </Switch>
);

export default ColumnTitle;
