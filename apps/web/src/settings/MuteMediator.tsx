import {
  type MuteEditEvent,
  displayedMutes,
  emptyMuteEdit,
  muteEditTransition,
} from "@streets/core/moderation/mute-edit";
import {
  type DecodedMuteList,
  MUTE_KIND,
  type MuteEntry,
  changeMuteListMany,
  decodeMuteList,
  matchingMutes,
} from "@streets/core/moderation/mute-list";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { Signer } from "@streets/core/signer/signer";
import type { Writer } from "@streets/core/write/writer";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createMemo,
  createResource,
  onCleanup,
  useContext,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { notifyError, notifySaved } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";

/**
 * 変えてから保存するまでの待ち。続けて足したり外したりしている間はまとめる ——
 * 非公開の項目は変えるたびに復号・暗号化・署名が要り、拡張機能の確認が重なる。
 */
const MUTE_SAVE_DELAY_MS = 800;

export type Mutes = {
  entries: Accessor<MuteEntry[]>;
  loading: Accessor<boolean>;
  /** 非公開の項目を読み書きできるか。署名の方法によってはできない。 */
  privatePart: Accessor<DecodedMuteList["privatePart"] | undefined>;
  /** タイムラインや通知で隠すか。自分の投稿は隠さない。 */
  hides: (event: NostrEvent) => boolean;
};

const MuteContext = createContext<Mutes>();

/**
 * ミュートを裁定する段。一覧を読み（非公開の項目は復号する）、書きかけを持ち、
 * 少し待ってからまとめて保存する。デッキの段に置き、カラム・メニュー・設定の
 * どこからの変更もここへ来る。
 */
export const MuteMediator: ParentComponent<{
  writer: Pick<Writer, "replace">;
  signer: Signer;
  viewer: string;
  muteList: Accessor<NostrEvent | undefined>;
  settled: Accessor<boolean>;
}> = (props) => {
  const [state, setState] = createStore(emptyMuteEdit());
  const apply = (event: MuteEditEvent) =>
    setState(reconcile(muteEditTransition(unwrap(state), event)));

  // 版が変わるたびに読み直す。source を包むのは、一覧がまだ無い（undefined）
  // ときも「無い」として読むため。
  const [decoded] = createResource(
    () => ({ event: props.muteList() }),
    ({ event }) => decodeMuteList(event, props.signer, props.viewer),
  );
  const saved = () => decoded.latest?.entries ?? [];
  const entries = createMemo(() => displayedMutes(saved(), state));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, MUTE_SAVE_DELAY_MS);
  };

  const flush = () => {
    apply({ type: "mutes/flush" });
    const sending = [...unwrap(state).saving];
    if (sending.length === 0) return;
    props.writer
      .replace(
        MUTE_KIND,
        undefined,
        changeMuteListMany(props.signer, props.viewer, sending),
      )
      .then(
        () => {
          apply({ type: "mutes/saved" });
          notifySaved("ミュートを保存しました");
        },
        (cause) => {
          apply({ type: "mutes/failed" });
          notifyError(cause, "ミュートを保存できませんでした");
        },
      )
      .finally(() => {
        if (unwrap(state).pending.length > 0) schedule();
      });
  };

  onCleanup(() => {
    clearTimeout(timer);
    if (unwrap(state).pending.length > 0) flush();
  });

  const privatePart = () => decoded.latest?.privatePart;

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "mutes/add": {
        // 公開範囲を選ばずに足したとき（メニューから）は、読める限り非公開にする。
        const visibility =
          event.visibility ??
          (privatePart() === "ready" ? "private" : "public");
        apply({
          type: "mutes/change",
          change: { type: "add", entry: { target: event.target, visibility } },
        });
        schedule();
        return true;
      }
      case "mutes/remove":
        apply({
          type: "mutes/change",
          change: { type: "remove", entry: event.entry },
        });
        schedule();
        return true;
      default:
        return false;
    }
  };

  const value: Mutes = {
    entries,
    loading: () =>
      decoded.latest === undefined ||
      (!props.settled() && props.muteList() === undefined),
    privatePart,
    hides: (event) =>
      event.pubkey !== props.viewer &&
      matchingMutes(entries(), event).length > 0,
  };

  return (
    <MuteContext.Provider value={value}>
      <Mediates handle={handle}>{props.children}</Mediates>
    </MuteContext.Provider>
  );
};

/** ミュートの段の外（Storybook の一部など）では undefined。何も隠さない。 */
export const useMutes = (): Mutes | undefined => useContext(MuteContext);
