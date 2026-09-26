import { columnTitle } from "@streets/core/deck/column-kinds";
import type { ColumnDef } from "@streets/core/deck/deck";
import {
  CHANNEL_CREATE_KIND,
  parseChannelMetadata,
} from "@streets/core/nostr/channel";
import { profileLabel } from "@streets/core/nostr/profile";
import { type Accessor, type Component, Show } from "solid-js";
import Name from "../note/Name";
import { useEvent } from "../note/use-event";
import { useProfile } from "../note/use-profile";
import { useOptionalReadLayer } from "../read-layer";

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
  const channelName = useChannelName(() => {
    const current = title();
    return "channel" in current ? current.channel : undefined;
  });
  return () => {
    const current = title();
    if ("person" in current) {
      return `${profileLabel(profile(), current.person)}${current.suffix}`;
    }
    if ("channel" in current) return channelName() ?? current.fallback;
    return current.text;
  };
};

/**
 * チャンネル（kind:40）の名前。手元に無ければ取りにいく。読み取り層が無い場所
 * （Storybook の一部）では引かない。
 */
const useChannelName = (
  id: Accessor<string | undefined>,
): Accessor<string | undefined> => {
  if (!useOptionalReadLayer()) return () => undefined;
  const lookup = useEvent(() => ({ id: id() ?? "" }));
  return () => {
    const current = lookup();
    return current.phase === "found" &&
      current.event.kind === CHANNEL_CREATE_KIND
      ? parseChannelMetadata(current.event.content)?.name
      : undefined;
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
