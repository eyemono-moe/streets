import type { EmojiSpec } from "@streets/core/emoji-maker/spec";
import type { Style } from "@streets/core/emoji-maker/style";
import { type Component, Show, createSignal } from "solid-js";
import { onceTrue } from "../../lazy-part";
import { useCustomEmojis } from "../custom-emojis";
import { MakerDialog } from "../lazy-emoji-picker";
import type { MakerSubmit, MakerVerb } from "./MakerDialog";
import type { MakerCandidate } from "./MakerFooter";

/**
 * 絵文字ピッカーから「調整する」で開くダイアログの開き方。ピッカーが閉じきってから開く。
 *
 * Ark UI（zag）は、開いている順にポップアップやダイアログを重ねて覚え、下の層が閉じると上の層も
 * まとめて閉じる。ピッカーが閉じる前にダイアログが重なりに入ると、ピッカーと一緒に閉じてしまう
 * （ダイアログを初めて作るときは、その場で重なりに入るので必ず起きる）。
 */
export const createMakerFlow = () => {
  // 開いている間と、閉じる動きの間は、開いたときの言葉と見た目のまま描く。
  const [adjust, setAdjust] = createSignal<{
    text: string;
    candidate: MakerCandidate;
  }>();
  const [adjusting, setAdjusting] = createSignal(false);
  const mounted = onceTrue(adjusting);
  let openAfterClose = false;

  const Dialog: Component<{
    verb: MakerVerb;
    sending?: boolean;
    onSend: (spec: EmojiSpec, style: Style, submit: MakerSubmit) => void;
    onRegister: (spec: EmojiSpec, shortcode: string) => void;
  }> = (props) => {
    const customEmojis = useCustomEmojis();
    return (
      <Show when={mounted() && adjust()}>
        {(value) => (
          <MakerDialog
            open={adjusting()}
            verb={props.verb}
            initialText={value().text}
            initialStyle={value().candidate.style}
            presetId={value().candidate.presetId}
            sending={props.sending}
            existingShortcodes={
              customEmojis?.list().emojis.map((emoji) => emoji.shortcode) ?? []
            }
            onSend={(spec, style, submit) => {
              props.onSend(spec, style, submit);
              setAdjusting(false);
            }}
            onRegister={(spec, shortcode) => {
              props.onRegister(spec, shortcode);
              setAdjusting(false);
            }}
            onClose={() => setAdjusting(false)}
          />
        )}
      </Show>
    );
  };

  return {
    /** 「調整する」を押した。このあとピッカーを閉じる。 */
    requestAdjust: (text: string, candidate: MakerCandidate) => {
      setAdjust({ text, candidate });
      openAfterClose = true;
    },
    /** ピッカー（Popover.Root）の `onExitComplete` に渡す。 */
    onPickerExitComplete: () => {
      if (!openAfterClose) return;
      openAfterClose = false;
      setAdjusting(true);
    },
    Dialog,
  };
};
