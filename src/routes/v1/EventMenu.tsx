import { Menu } from "@ark-ui/solid/menu";
import { type Component, For } from "solid-js";
import { Portal } from "solid-js/web";
import type { NostrEvent } from "../../core/nostr/event";
import { encodeBech32 } from "../../core/nostr/nip19";

/**
 * イベントの右上に置くメニュー。**アクション列 (返信・リポスト等) とは
 * 別の層**として分けてある: アクション列はイベントの種別ごとに有無が
 * 変わる「本文に対する操作」で、こちらは author と id がどのイベントにも
 * 必ずある以上、**種別に関わらず必ず出せる操作**だけを持つ。
 *
 * その基準で本来ここに入るのは、イベントのミュート、author の
 * フォロー/ミュート/ブロック、通報 —— いずれも書き込み側が未実装なので
 * まだ置かない。押しても何も起きない項目を先に並べると「未実装」と
 * 「壊れている」が区別できなくなる (ADR-0026)。
 *
 * したがって今あるのは、クライアント内で完結する 2 つだけ。
 */
const EventMenu: Component<{ event: NostrEvent }> = (props) => {
  // NIP-19 の `note` (TLV 無しの生の id)。`nevent` はリレーヒントや
  // author を TLV で持つが、その符号化器がまだ無い (`nip19.ts` は復号と
  // 素の bech32 だけ)。`note` でも参照としては一意に定まる。
  const noteUri = () => `nostr:${encodeBech32("note", props.event.id)}`;

  const items = () => [
    { value: "copy-link", label: "リンクをコピー", text: noteUri() },
    {
      value: "copy-json",
      label: "JSON をコピー",
      text: JSON.stringify(props.event, null, 2),
    },
  ];

  return (
    <Menu.Root
      onSelect={(details) => {
        const item = items().find((i) => i.value === details.value);
        if (!item) return;
        // 失敗しても握り潰す。権限が無い/非セキュアコンテキストで
        // reject されるが、コピーできなかったことをここで伝える手段
        // (トースト) がまだ無い —— 例外を投げて他の描画を巻き込むより、
        // 何も起きないほうがまだ状態が読める。
        void navigator.clipboard?.writeText(item.text).catch(() => {});
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
            <For each={items()}>
              {(item) => (
                <Menu.Item
                  value={item.value}
                  class="cursor-pointer rounded-1.5 px-2.5 py-1.5 data-[highlighted]:bg-alpha-hover"
                >
                  {item.label}
                </Menu.Item>
              )}
            </For>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

export default EventMenu;
