import { decodeNip19 } from "@streets/core/nostr/nip19";
import { type Component, getOwner, runWithOwner } from "solid-js";
import { insert } from "solid-js/web";
import UserLink from "../note/UserLink";

const pubkeyOf = (ref: string | undefined): string | undefined => {
  const decoded = ref ? decodeNip19(ref) : undefined;
  return decoded?.kind === "npub" || decoded?.kind === "nprofile"
    ? decoded.pubkey
    : undefined;
};

/**
 * ビルドのときに HTML にしたリリースノートの本文。中の人の参照（`nostr:npub1…`）は、
 * 投稿と同じ名前の表示（触れると名刺、押すとその人のカラム）に差し替える。差し込む
 * 部品はこの部品と同じ所有者の下に置き、読み取り層やイベントの段をそのまま使う。
 */
const NoteBody: Component<{ html: string; class?: string }> = (props) => {
  const owner = getOwner();
  const mount = (element: HTMLDivElement) => {
    // 本文はリポジトリのファイル（PR でレビューしたもの）をビルドで HTML にしたもの。
    element.innerHTML = props.html;
    for (const target of element.querySelectorAll<HTMLElement>(
      "[data-nostr-user]",
    )) {
      const pubkey = pubkeyOf(target.dataset.nostrUser);
      if (!pubkey) continue;
      target.textContent = "";
      runWithOwner(owner, () =>
        insert(target, () => <UserLink pubkey={pubkey} mention />),
      );
    }
  };
  return <div ref={mount} class={props.class} />;
};

export default NoteBody;
