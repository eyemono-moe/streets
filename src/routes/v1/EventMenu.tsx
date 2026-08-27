import { Menu } from "@ark-ui/solid/menu";
import { type Component, For, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { threadMuteTarget } from "../../core/moderation/mute-list";
import type { NostrEvent } from "../../core/nostr/event";
import { encodeBech32 } from "../../core/nostr/nip19";
import { useRender } from "../../core/view/render-context";
import { type MuteList, useOptionalMuteList } from "./mute-list";

/**
 * イベントの右上に置くメニュー。**アクション列 (返信・リポスト等) とは
 * 別の層**として分けてある: アクション列はイベントの種別ごとに有無が
 * 変わる「本文に対する操作」で、こちらは author と id がどのイベントにも
 * 必ずある以上、**種別に関わらず必ず出せる操作**だけを持つ。
 *
 * フォロー/ブロック/通報は送信経路がまだ無いので置かない。ミュートは
 * `MuteList` が保存まで担うため、リンク・JSON のコピーと並べて提供する。
 * 押しても何も起きない項目を先に並べると「未実装」と「壊れている」が
 * 区別できなくなる (ADR-0026)。
 */
const EventMenu: Component<{ event: NostrEvent }> = (props) => {
  const render = useRender();
  const muteList = useOptionalMuteList();
  const [error, setError] = createSignal<string>();
  // NIP-19 の `note` (TLV 無しの生の id)。`nevent` はリレーヒントや
  // author を TLV で持つが、その符号化器がまだ無い (`nip19.ts` は復号と
  // 素の bech32 だけ)。`note` でも参照としては一意に定まる。
  const noteUri = () => `nostr:${encodeBech32("note", props.event.id)}`;
  const threadTarget = () => threadMuteTarget(props.event);
  const threadMuted = () =>
    muteList
      ?.matches(props.event)
      .some(
        (entry) =>
          entry.target.type === "thread" &&
          entry.target.value === threadTarget().value,
      ) ?? false;
  const authorMuted = () =>
    muteList
      ?.matches(props.event)
      .some((entry) => entry.target.type === "pubkey") ?? false;

  const copyItems = [
    { value: "copy-link", label: "リンクをコピー" },
    { value: "copy-json", label: "JSON をコピー" },
  ];

  const addPrivateMute = async (target: Parameters<MuteList["add"]>[0]) => {
    if (!muteList) return;
    setError(undefined);
    try {
      await muteList.add(target, "private");
    } catch {
      setError(
        muteList.error() ??
          "ミュートを保存できませんでした。再試行してください",
      );
    }
  };

  return (
    <Menu.Root
      onSelect={(details) => {
        if (details.value === "mute-thread") {
          if (threadMuted()) return;
          void addPrivateMute(threadTarget());
          return;
        }
        if (details.value === "mute-author") {
          if (authorMuted()) return;
          void addPrivateMute({ type: "pubkey", value: props.event.pubkey });
          return;
        }
        const text =
          details.value === "copy-link"
            ? noteUri()
            : details.value === "copy-json"
              ? JSON.stringify(props.event, null, 2)
              : undefined;
        if (!text) return;
        // 失敗しても握り潰す。権限が無い/非セキュアコンテキストで
        // reject されるが、コピーできなかったことをここで伝える手段
        // (トースト) がまだ無い —— 例外を投げて他の描画を巻き込むより、
        // 何も起きないほうがまだ状態が読める。
        void navigator.clipboard?.writeText(text).catch(() => {});
      }}
    >
      <Menu.Trigger
        data-testid="event-menu-trigger"
        aria-label="このノートの操作"
        // `bg-transparent` が要る (`ProfileHover.tsx` と同じ罠)。
        // タイムスタンプと同じ `c-secondary` に留める —— 全ての行に出る
        // ので、本文より目立ってはいけない。ホバーでのみ出す案は採らない:
        // モバイルにホバーが無く、レスポンシブ前提だと成立しない。
        class="flex h-6 w-6 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-1.5 bg-transparent hover:bg-alpha-hover"
      >
        <span class="i-material-symbols:more-vert c-secondary h-4.5 w-4.5" />
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content
            data-testid="event-menu"
            class="b-1 min-w-44 rounded-2.5 bg-primary p-1.5 text-caption shadow-lg focus:outline-none"
          >
            <For each={copyItems}>
              {(item) => (
                <Menu.Item
                  value={item.value}
                  class="cursor-pointer rounded-1.5 px-2.5 py-1.5 data-[highlighted]:bg-alpha-hover"
                >
                  {item.label}
                </Menu.Item>
              )}
            </For>
            <Show when={muteList}>
              <Menu.Separator class="my-1 border-primary border-t" />
              <Menu.Item
                value="mute-thread"
                disabled={threadMuted()}
                class="disabled:c-secondary rounded-1.5 px-2.5 py-1.5 enabled:cursor-pointer enabled:data-[highlighted]:bg-alpha-hover"
              >
                {threadMuted()
                  ? "このスレッドはミュート済み（設定で解除）"
                  : "このスレッドをミュート"}
              </Menu.Item>
            </Show>
            <Show when={muteList && props.event.pubkey !== render.viewerPubkey}>
              <Menu.Separator class="my-1 border-primary border-t" />
              <Menu.Item
                value="mute-author"
                disabled={authorMuted()}
                class="disabled:c-secondary rounded-1.5 px-2.5 py-1.5 enabled:cursor-pointer enabled:data-[highlighted]:bg-alpha-hover"
              >
                {authorMuted()
                  ? "この著者はミュート済み（設定で解除）"
                  : "この著者をミュート"}
              </Menu.Item>
            </Show>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
      <Show when={error()}>
        {(message) => (
          <p
            class="mt-1 text-caption text-red-8"
            data-testid="event-menu-error"
          >
            {message()}
          </p>
        )}
      </Show>
    </Menu.Root>
  );
};

export default EventMenu;
