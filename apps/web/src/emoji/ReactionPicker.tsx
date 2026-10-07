import { Popover } from "@ark-ui/solid/popover";
import type { EmojiSpec } from "@streets/core/emoji-maker/spec";
import type { Style } from "@streets/core/emoji-maker/style";
import type { ReactionInput } from "@streets/core/nostr/build/reaction";
import type { NostrEvent } from "@streets/core/nostr/event";
import { type Component, type JSX, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { useSending } from "../actions-mediator";
import { onceTrue } from "../lazy-part";
import { useDispatch } from "../ui-events";
import PopoverTrigger from "../ui/PopoverTrigger";
import { useCustomEmojis, useEmojiGroups } from "./custom-emojis";
import type { PickerEmoji } from "./emoji-data";
import { EmojiPicker, MakerDialog, MakerFooter } from "./lazy-emoji-picker";
import { lastStyle, rememberLastStyle } from "./maker/last-style";
import type { MakerCandidate } from "./maker/MakerFooter";
import { rememberEmoji } from "./recent-emoji";

/**
 * 押せる要素をそのままトリガーにするための、Ark UI から渡ってくる props。
 * 戻り値の要素型は Ark UI 側が `any` で持つので、そこに合わせる。
 */
export type PickerTrigger = (
  userProps?: JSX.IntrinsicElements["button"],
  // Ark UI の `asChild` の型に合わせる
) => JSX.HTMLAttributes<any>;

export const reactionInputOf = (emoji: PickerEmoji): ReactionInput =>
  emoji.kind === "unicode"
    ? { type: "text", content: emoji.char }
    : { type: "emoji", shortcode: emoji.shortcode, url: emoji.url };

/**
 * リアクションに使う絵文字を選ぶ。選んだらそのまま送る —— 確認を挟むほどの
 * 操作ではなく、v0 でも選んだ時点で送っていた。
 */
const ReactionPicker: Component<{
  target: NostrEvent;
  /** 押して開く要素。渡さないときは `anchor` の位置に、`open` で開く。 */
  trigger?: (props: PickerTrigger) => JSX.Element;
  /** トリガーを置かずに開くときの、出す位置と閉じた後にフォーカスを戻す先。 */
  anchor?: () => HTMLElement | undefined;
  /** 外から開くとき（メニューの「リアクションする」など）。渡さなければトリガーで開閉する。 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}> = (props) => {
  const dispatch = useDispatch();
  const customGroups = useEmojiGroups();
  // いいねと作った絵文字は同じ鍵で数える（どちらも kind:7 を 1 件送る操作）。
  const sending = useSending(() => ({
    type: "note/react",
    target: props.target,
    input: { type: "text", content: "+" },
  }));
  // 開いている間と、閉じる動きの間は、開いたときの言葉と見た目のまま描く。
  const [adjust, setAdjust] = createSignal<{
    text: string;
    candidate: MakerCandidate;
  }>();
  const [adjusting, setAdjusting] = createSignal(false);
  // 「調整する」を押したら、ピッカーが閉じきってからダイアログを開く。Ark UI（zag）は、
  // 開いている順にポップアップやダイアログを重ねて覚え、下の層が閉じると上の層もまとめて閉じる。
  // ピッカーが閉じる前にダイアログが重なりに入ると、ピッカーと一緒に閉じてしまう（ダイアログを
  // 初めて作るときは、その場で重なりに入るので必ず起きる）。
  let openAfterClose = false;
  const dialogMounted = onceTrue(adjusting);
  const customEmojis = useCustomEmojis();
  const existingShortcodes = () =>
    customEmojis?.list().emojis.map((emoji) => emoji.shortcode) ?? [];
  const sendMade = (spec: EmojiSpec, style: Style, shortcode?: string) => {
    rememberLastStyle(style);
    dispatch({
      type: "note/react-made",
      target: props.target,
      spec,
      shortcode,
    });
  };
  return (
    <>
      {/* 閉じている間は中身を作らない（絵文字は 1900 件あり、投稿ごとに 2 か所ある）。 */}
      <Popover.Root
        lazyMount
        unmountOnExit
        positioning={{
          placement: "bottom-start",
          getAnchorElement: props.anchor && (() => props.anchor?.() ?? null),
        }}
        finalFocusEl={props.anchor && (() => props.anchor?.() ?? null)}
        open={props.open}
        onOpenChange={(details) => props.onOpenChange?.(details.open)}
        onExitComplete={() => {
          if (!openAfterClose) return;
          openAfterClose = false;
          setAdjusting(true);
        }}
      >
        <Show when={props.trigger}>
          {(trigger) => <PopoverTrigger asChild={trigger()} />}
        </Show>
        <Portal>
          <Popover.Positioner>
            <Popover.Content class="motion-pop outline-none">
              <Popover.Context>
                {(api) => (
                  <EmojiPicker
                    customGroups={customGroups()}
                    onSelect={(emoji) => {
                      rememberEmoji(emoji);
                      dispatch({
                        type: "note/react",
                        target: props.target,
                        input: reactionInputOf(emoji),
                      });
                      api().setOpen(false);
                    }}
                    footer={(query) => (
                      <MakerFooter
                        query={query()}
                        sending={sending()}
                        lastStyle={lastStyle()}
                        onSend={(spec, style) => {
                          sendMade(spec, style);
                          api().setOpen(false);
                        }}
                        onAdjust={(text, candidate) => {
                          setAdjust({ text, candidate });
                          openAfterClose = true;
                          api().setOpen(false);
                        }}
                      />
                    )}
                  />
                )}
              </Popover.Context>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
      <Show when={dialogMounted() && adjust()}>
        {(value) => (
          <MakerDialog
            open={adjusting()}
            initialText={value().text}
            initialStyle={value().candidate.style}
            presetId={value().candidate.presetId}
            sending={sending()}
            existingShortcodes={existingShortcodes()}
            onSend={(spec, style, submit) => {
              sendMade(spec, style, submit.shortcode);
              if (submit.register) {
                dispatch({
                  type: "emoji/add-made",
                  spec,
                  shortcode: submit.shortcode,
                });
              }
              setAdjusting(false);
            }}
            onRegister={(spec, shortcode) => {
              dispatch({ type: "emoji/add-made", spec, shortcode });
              setAdjusting(false);
            }}
            onClose={() => setAdjusting(false)}
          />
        )}
      </Show>
    </>
  );
};

export default ReactionPicker;
