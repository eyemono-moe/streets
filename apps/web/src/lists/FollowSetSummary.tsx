import {
  type FollowSet,
  followSetName,
  mayBeLegacyMuteSet,
} from "@streets/core/lists/follow-set";
import { type Component, For, Show } from "solid-js";
import Avatar from "../note/Avatar";
import Name from "../note/Name";
import FollowSetPicture from "./FollowSetPicture";

/** 「12 人・非公開 3 人」。非公開がいなければ人数だけ。 */
export const memberCountLabel = (set: FollowSet): string => {
  const hidden = set.members.filter(
    (member) => member.visibility === "private",
  ).length;
  const total = `${set.members.length} 人`;
  return hidden > 0 ? `${total}・非公開 ${hidden} 人` : total;
};

/** 作った人。アイコンと名前を 1 行に並べる。 */
export const FollowSetAuthor: Component<{ pubkey: string }> = (props) => (
  <span class="flex min-w-0 items-center gap-1">
    <Avatar pubkey={props.pubkey} size="tiny" static />
    <span class="min-w-0 truncate">
      <Name pubkey={props.pubkey} />
    </span>
  </span>
);

/** `d` が `mute` のリストに添える一文。 */
export const LegacyMuteNotice: Component = () => (
  <span class="c-status-warn flex items-start gap-1 text-caption">
    <span
      class="i-material-symbols:warning-outline-rounded mt-0.5 size-3.5 shrink-0"
      aria-hidden="true"
    />
    一部のクライアントでは、このリストがミュートする人の指定として扱われている可能性があります
  </span>
);

/** メンバーの顔を並べる数。どんな人の集まりかが分かれば足りる。 */
const MEMBER_FACES = 6;

/**
 * リストの中身を 1 行で見せる。一覧の行と、流れてきたリストのカード（kind:30000）で
 * 同じ形にする。押したときの動きは外側が決める。
 */
const FollowSetSummary: Component<{
  set: FollowSet;
  /** 作った人を出す。投稿として流れてきたときは、見出しに作った人が出ているので省く。 */
  author?: boolean;
}> = (props) => (
  <span class="flex w-full min-w-0 items-start gap-2.5">
    <FollowSetPicture url={props.set.image} class="size-10 rounded-2" />
    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="c-primary truncate font-600 text-body">
        {followSetName(props.set)}
      </span>
      <span class="c-secondary flex min-w-0 items-center gap-1 text-caption">
        <Show
          when={props.author !== false}
          fallback={<span>{memberCountLabel(props.set)}</span>}
        >
          <FollowSetAuthor pubkey={props.set.pubkey} />
          <span class="shrink-0">・{memberCountLabel(props.set)}</span>
        </Show>
      </span>
      <Show when={props.set.description}>
        {(description) => (
          <span class="c-secondary truncate text-caption">{description()}</span>
        )}
      </Show>
      <Show when={props.set.members.length > 0}>
        <span class="mt-1 flex items-center gap-1" aria-hidden="true">
          <For each={props.set.members.slice(0, MEMBER_FACES)}>
            {(member) => <Avatar pubkey={member.pubkey} size="tiny" static />}
          </For>
        </span>
      </Show>
      <Show when={mayBeLegacyMuteSet(props.set)}>
        <LegacyMuteNotice />
      </Show>
    </span>
    <span
      class="c-secondary i-material-symbols:chevron-right-rounded size-5 shrink-0 self-center"
      aria-hidden="true"
    />
  </span>
);

export default FollowSetSummary;
