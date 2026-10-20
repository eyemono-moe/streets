import type { EmojiSpec } from "@streets/core/emoji-maker/spec";
import type { Style } from "@streets/core/emoji-maker/style";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReactionInput } from "@streets/core/nostr/reaction";
import type { Component, JSX } from "solid-js";
import { useSending } from "../actions-mediator";
import { t } from "../i18n/locale";
import { useDispatch } from "../ui-events";
import { useEmojiGroups } from "./custom-emojis";
import type { PickerEmoji } from "./emoji-data";
import { EmojiPicker, MakerFooter } from "./lazy-emoji-picker";
import { lastStyle, rememberLastStyle } from "./maker/last-style";
import { createMakerFlow } from "./maker/maker-flow";
import PickerSurface, { type PickerTrigger } from "./PickerSurface";
import { rememberEmoji } from "./recent-emoji";

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
  const maker = createMakerFlow();
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
      <PickerSurface
        title={t("emoji.picker.react")}
        trigger={props.trigger}
        anchor={props.anchor}
        finalFocusEl={props.anchor}
        placement="bottom-start"
        open={props.open}
        onOpenChange={props.onOpenChange}
        onExitComplete={maker.onPickerExitComplete}
      >
        {(close, layout) => (
          <EmojiPicker
            layout={layout}
            customGroups={customGroups()}
            onSelect={(emoji) => {
              rememberEmoji(emoji);
              dispatch({
                type: "note/react",
                target: props.target,
                input: reactionInputOf(emoji),
              });
              close();
            }}
            footer={(query) => (
              <MakerFooter
                layout={layout}
                query={query()}
                sending={sending()}
                lastStyle={lastStyle()}
                onSend={(spec, style) => {
                  sendMade(spec, style);
                  close();
                }}
                onAdjust={(text, candidate) => {
                  maker.requestAdjust(text, candidate);
                  close();
                }}
              />
            )}
          />
        )}
      </PickerSurface>
      <maker.Dialog
        verb="send"
        sending={sending()}
        onSend={(spec, style, submit) => {
          sendMade(spec, style, submit.shortcode);
          if (submit.register) {
            dispatch({
              type: "emoji/add-made",
              spec,
              shortcode: submit.shortcode,
            });
          }
        }}
        onRegister={(spec, shortcode) =>
          dispatch({ type: "emoji/add-made", spec, shortcode })
        }
      />
    </>
  );
};

export default ReactionPicker;
