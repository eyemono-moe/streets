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
const Candidate: Component<{
  text: string;
  candidate: MakerCandidate;
  disabled: boolean;
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
      aria-label={`${props.candidate.label}で「${props.text}」を送る`}
      disabled={props.disabled || !image()}
      class="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-full border border-primary bg-primary px-1.5 enabled:hover:bg-secondary disabled:cursor-default"
      onClick={() => props.onSend(spec(), props.candidate.style)}
    >
      <Show
        when={image()}
        fallback={<span class="size-4.5 rounded-1 bg-secondary" />}
      >
        {(value) => (
          <img
            src={value().src}
            alt=""
            draggable={false}
            data-no-touch-menu
            class="h-4.5 w-auto max-w-12 object-contain"
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
  /** 最後に送った見た目。 */
  lastStyle: Style | undefined;
  onSend: (spec: EmojiSpec, style: Style) => void;
  onAdjust: (text: string, candidate: MakerCandidate) => void;
}> = (props) => {
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
    <div class="b-t-1 flex h-9 shrink-0 items-center gap-1 border-primary pt-1.5">
      <Switch>
        <Match when={text() === ""}>
          <Button
            variant="ghost"
            size="sm"
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
          <div class="scrollbar-none flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
            <For each={candidates()}>
              {(candidate) => (
                <Candidate
                  text={text()}
                  candidate={candidate}
                  disabled={props.sending}
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
          size="sm"
          onClick={() => props.onAdjust(text(), first())}
        >
          調整する
        </Button>
      </Show>
    </div>
  );
};

export default MakerFooter;
