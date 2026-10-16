import { type EmojiSpec, specOf } from "@streets/core/emoji-maker/spec";
import {
  PICKER_PRESET_IDS,
  type Style,
  presetById,
  sameStyle,
  styleOfPreset,
} from "@streets/core/emoji-maker/style";
import {
  MAX_CHARS,
  autoLayout,
  textProblem,
} from "@streets/core/emoji-maker/text";
import { type Component, For, Match, Show, Switch, createMemo } from "solid-js";
import Button from "../../ui/Button";
import type { PickerLayout } from "../PickerSurface";
import { prefetchKana } from "./glyphs";
import { createPreview } from "./preview";

export type MakerCandidate = { label: string; style: Style; presetId?: string };

/** 下端に並べる見た目。決めた 3 つのプリセットと、最後に送った見た目（同じなら出さない）。 */
export const pickerCandidates = (last: Style | undefined): MakerCandidate[] => {
  const presets = PICKER_PRESET_IDS.flatMap((id) => {
    const preset = presetById(id);
    return preset
      ? [{ label: preset.label, style: styleOfPreset(preset), presetId: id }]
      : [];
  });
  if (!last || presets.some((candidate) => sameStyle(candidate.style, last))) {
    return presets;
  }
  return [...presets, { label: "前回の見た目", style: last }];
};

/** 候補 1 つ。投稿の下に並ぶのと同じ大きさ（高さ 18px・幅 48px まで）で見せる。 */
/**
 * 出す形ごとの大きさ。ドロワーでは指で押す分、候補とボタンを大きくし、上の一覧との間も空ける。
 */
const SIZES = {
  popup: {
    row: "h-9 gap-1 pt-1.5",
    candidates: "gap-0.5",
    candidate: "h-7 px-1.5",
    image: "h-4.5 max-w-12",
    placeholder: "size-4.5",
    button: "sm",
  },
  sheet: {
    row: "h-11 gap-1.5 pt-1.5",
    candidates: "gap-1",
    candidate: "h-9 px-2",
    image: "h-5.5 max-w-14",
    placeholder: "size-5.5",
    button: "md",
  },
} as const satisfies Record<PickerLayout, unknown>;
type Sizes = (typeof SIZES)[PickerLayout];

const Candidate: Component<{
  text: string;
  /** 押したときにすること。読み上げの言葉に使う。 */
  action: string;
  candidate: MakerCandidate;
  disabled: boolean;
  sizes: Sizes;
  onSend: (spec: EmojiSpec, style: Style) => void;
}> = (props) => {
  const spec = createMemo(() =>
    specOf(autoLayout(props.text), props.candidate.style),
  );
  const preview = createPreview(spec);
  const image = () => {
    const value = preview.latest;
    return value?.type === "image" ? value : undefined;
  };
  return (
    <button
      type="button"
      title={props.candidate.label}
      aria-label={`${props.candidate.label}で「${props.text}」を${props.action}`}
      disabled={props.disabled || !image()}
      class={`inline-flex shrink-0 cursor-pointer items-center rounded-full border border-control bg-primary enabled:hover:bg-secondary disabled:cursor-default ${props.sizes.candidate}`}
      onClick={() => props.onSend(spec(), props.candidate.style)}
    >
      <Show
        when={image()}
        fallback={
          <span class={`rounded-1 bg-secondary ${props.sizes.placeholder}`} />
        }
      >
        {(value) => (
          <img
            src={value().src}
            alt=""
            draggable={false}
            data-no-touch-menu
            class={`w-auto object-contain ${props.sizes.image}`}
          />
        )}
      </Show>
    </button>
  );
};

/**
 * 絵文字ピッカーの下端。何も打っていなければ「カスタム絵文字を作る」だけを出し、打ったら
 * その言葉を見た目違いで並べる。押せばそのまま送る。細かく直すときは「調整する」で
 * ダイアログを開く。
 */
const MakerFooter: Component<{
  query: string;
  /** 送っている途中。続けて押させない。 */
  sending: boolean;
  /** 押したときにすること。リアクションは「送る」、本文は「入れる」。既定は送る。 */
  verb?: "send" | "insert";
  /** 最後に送った見た目。 */
  lastStyle: Style | undefined;
  onSend: (spec: EmojiSpec, style: Style) => void;
  onAdjust: (text: string, candidate: MakerCandidate) => void;
  /** 既定はポップアップの大きさ。 */
  layout?: PickerLayout;
}> = (props) => {
  const sizes = () => SIZES[props.layout ?? "popup"];
  prefetchKana();
  const text = () => props.query.trim();
  const candidates = createMemo(() => pickerCandidates(props.lastStyle));
  const first = () => candidates()[0] as MakerCandidate;
  // 1 つ目の見本で、描けない字があるかを見る（どの見た目でも字は同じ）。
  const firstPreview = createPreview(() =>
    text() === "" || textProblem(text(), true)
      ? undefined
      : specOf(autoLayout(text()), first().style),
  );
  const missing = () => {
    const value = firstPreview.latest;
    return value?.type === "missing" ? value.chars : undefined;
  };

  return (
    <div
      class={`b-t-1 flex shrink-0 items-center border-control ${sizes().row}`}
    >
      <Switch>
        <Match when={text() === ""}>
          <Button
            variant="ghost"
            size={sizes().button}
            icon="i-material-symbols:add-rounded"
            onClick={() => props.onAdjust("", first())}
          >
            カスタム絵文字を作る
          </Button>
        </Match>
        <Match when={textProblem(text(), true)?.type === "too-many-chars"}>
          <p class="c-secondary min-w-0 flex-1 text-caption">
            カスタム絵文字にできるのは {MAX_CHARS} 字までです
          </p>
        </Match>
        <Match when={missing()}>
          {(chars) => (
            <p class="c-secondary min-w-0 flex-1 text-caption">
              描けない文字があります（{chars().join(" ")}）
            </p>
          )}
        </Match>
        <Match when={true}>
          <div
            class={`scrollbar-none flex min-w-0 flex-1 overflow-x-auto ${sizes().candidates}`}
          >
            <For each={candidates()}>
              {(candidate) => (
                <Candidate
                  text={text()}
                  candidate={candidate}
                  action={props.verb === "insert" ? "入れる" : "送る"}
                  disabled={props.sending}
                  sizes={sizes()}
                  onSend={props.onSend}
                />
              )}
            </For>
          </div>
        </Match>
      </Switch>
      <Show when={text() !== ""}>
        <Button
          variant="ghost"
          size={sizes().button}
          onClick={() => props.onAdjust(text(), first())}
        >
          調整する
        </Button>
      </Show>
    </div>
  );
};

export default MakerFooter;
