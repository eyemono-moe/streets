import type { FontId } from "@streets/core/emoji-maker/glyph-shard";
import type { EmojiSpec } from "@streets/core/emoji-maker/spec";
import {
  type HexColor,
  PRESETS,
  type Style,
  autoOutline,
  presetById,
  resolveOutline,
} from "@streets/core/emoji-maker/style";
import {
  type Align,
  type Fit,
  MAX_CHARS,
  MAX_LINES,
  type Shape,
  type TextProblem,
  graphemes,
  layoutOf,
  textProblem,
} from "@streets/core/emoji-maker/text";
import { defaultShortcode } from "@streets/core/emoji-maker/url";
import { isValidShortcode } from "@streets/core/nostr/content";
import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import Button from "../../ui/Button";
import ColorField from "../../ui/ColorField";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../../ui/Dialog";
import SegmentedControl from "../../ui/SegmentedControl";
import Switch from "../../ui/Switch";
import TextField from "../../ui/TextField";
import { createPreview } from "./preview";

/** テキストが空のときに、入力欄と見本に出す言葉。 */
const PLACEHOLDER = "カスタム";

const FONT_OPTIONS: { value: FontId; label: string }[] = [
  { value: "gothic", label: "ゴシック" },
  { value: "rounded", label: "丸ゴシック" },
  { value: "serif", label: "明朝" },
];

type OutlineMode = "auto" | "pick" | "none";

const problemMessage = (problem: TextProblem | undefined) => {
  switch (problem?.type) {
    case "too-many-chars":
      return `${MAX_CHARS} 字までです（いま ${problem.count} 字）`;
    case "too-many-lines":
      return `${MAX_LINES} 行までです`;
    default:
      return undefined;
  }
};

/** 1 行の字数が多いと、高さ 18px では線が重なって読めない。 */
const cramped = (spec: EmojiSpec) =>
  spec.shape === "square" &&
  (spec.lines.length >= 3 ||
    Math.max(...spec.lines.map((line) => graphemes(line).length)) >= 4);

/** 投稿の下に並んだときの姿。明るい背景と暗い背景で並べる。 */
const RealSize: Component<{ src: string | undefined }> = (props) => (
  <span class="inline-flex items-center gap-1.5">
    <For each={[false, true]}>
      {(dark) => (
        <span
          class="inline-flex h-7 items-center gap-1 rounded-full border px-2 text-caption"
          classList={{
            "border-ui-2 bg-white c-ui-8": !dark,
            "border-ui-7 bg-ui-950 c-ui-2": dark,
          }}
        >
          <Show when={props.src} fallback={<span class="size-4.5" />}>
            {(src) => (
              <img
                src={src()}
                alt=""
                draggable={false}
                class="h-4.5 w-auto max-w-12 object-contain"
              />
            )}
          </Show>
          3
        </span>
      )}
    </For>
  </span>
);

const Field: Component<{ label: string; children: unknown }> = (props) => (
  <div class="flex flex-col gap-1">
    <span class="c-secondary text-caption">{props.label}</span>
    {props.children as never}
  </div>
);

/**
 * カスタム絵文字を細かく作る。プリセットか前回の見た目を出発点に、改行・色・縁取り・
 * フォント・並べ方を変える。見本は流しても見えるように貼り付ける（狭い画面では上、
 * 広い画面では左の列）。送る行は流す部分の外に置く。
 */
/** 送る・登録するときの名前と、自分の絵文字に足すか。 */
export type MakerSubmit = { shortcode: string; register: boolean };

export const MakerEditor: Component<{
  initialText: string;
  initialStyle: Style;
  presetId?: string;
  sending?: boolean;
  /** 自分の絵文字に、もうある名前。 */
  existingShortcodes: readonly string[];
  /** 初めの名前と、登録するか。ストーリーで各状態を見せるため。 */
  initialShortcode?: string;
  initialRegister?: boolean;
  onSend: (spec: EmojiSpec, style: Style, submit: MakerSubmit) => void;
  /** 送らずに、自分の絵文字に足すだけ。 */
  onRegister: (spec: EmojiSpec, shortcode: string) => void;
  onBack: () => void;
}> = (props) => {
  const first = props.initialStyle;
  const [text, setText] = createSignal(props.initialText);
  const [autoBreak, setAutoBreak] = createSignal(true);
  const [presetId, setPresetId] = createSignal(props.presetId);
  const [color, setColor] = createSignal<HexColor>(first.color);
  const [outlineMode, setOutlineMode] = createSignal<OutlineMode>(
    first.outline === "auto"
      ? "auto"
      : first.outline === null
        ? "none"
        : "pick",
  );
  const [outlineColor, setOutlineColor] = createSignal<HexColor>(
    first.outline !== "auto" && first.outline !== null
      ? first.outline
      : "#1b1b1f",
  );
  const [outlineWidth, setOutlineWidth] = createSignal(first.outlineWidth);
  const [font, setFont] = createSignal<FontId>(first.font);
  // 並べ方は、自分で選ぶまでは文字から決まる値に従う。
  const [shape, setShape] = createSignal<Shape>();
  const [fit, setFit] = createSignal<Fit>();
  const [align, setAlign] = createSignal<Align>();
  const [shortcode, setShortcode] = createSignal(props.initialShortcode ?? "");
  const [register, setRegister] = createSignal(props.initialRegister ?? false);

  const style = createMemo<Style>(() => ({
    color: color(),
    outline:
      outlineMode() === "auto"
        ? "auto"
        : outlineMode() === "none"
          ? null
          : outlineColor(),
    outlineWidth: outlineWidth(),
    font: font(),
  }));

  const specFor = (s: Style): EmojiSpec => {
    // 空の間は、見本を「カスタム」で描く（何も無い枠では、見た目を選びようがない）。
    const layout = layoutOf(
      text().trim() === "" ? PLACEHOLDER : text(),
      autoBreak(),
    );
    return {
      lines: layout.lines,
      shape: shape() ?? layout.shape,
      fit: fit() ?? layout.fit,
      align: align() ?? layout.align,
      color: s.color,
      outline: resolveOutline(s),
      outlineWidth: s.outlineWidth,
      font: s.font,
    };
  };
  const spec = createMemo(() => specFor(style()));
  const problem = () => textProblem(text(), autoBreak());
  const preview = createPreview(() =>
    problem() && text().trim() !== "" ? undefined : spec(),
  );
  const image = () => {
    const value = preview.latest;
    return value?.type === "image" ? value : undefined;
  };
  const missing = () => {
    const value = preview.latest;
    return value?.type === "missing" ? value.chars : undefined;
  };
  const autoShortcode = () => defaultShortcode(spec());
  const finalShortcode = () => shortcode().trim() || autoShortcode();
  const shortcodeError = () => {
    const value = shortcode().trim();
    return value !== "" && !isValidShortcode(value)
      ? "半角の英数字・「_」・「-」だけが使えます"
      : undefined;
  };
  const replacing = () =>
    register() && props.existingShortcodes.includes(finalShortcode());
  const blocked = () =>
    shortcodeError() !== undefined ||
    problem() !== undefined ||
    missing() !== undefined ||
    !image() ||
    props.sending === true;

  const applyPreset = (id: string) => {
    const preset = presetById(id);
    if (!preset) return;
    setPresetId(id);
    setColor(preset.color);
    setFont(preset.font);
    setOutlineWidth(preset.outlineWidth);
    setOutlineMode("auto");
  };

  const Sample = (p: { dark: boolean }) => (
    <div
      class="grid h-24 place-items-center p-2 sm:h-36"
      classList={{ "bg-white": !p.dark, "bg-ui-950": p.dark }}
    >
      <Show when={image()}>
        {(value) => (
          <img
            src={value().src}
            alt={spec().lines.join("")}
            draggable={false}
            class="max-h-20 max-w-full object-contain sm:max-h-32"
          />
        )}
      </Show>
    </div>
  );

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div class="grid gap-x-4 sm:grid-cols-[16rem_minmax(0,1fr)]">
          <div class="sticky top-0 z-1 flex flex-col gap-2 bg-primary pb-3 sm:self-start">
            <div class="grid grid-cols-2 overflow-hidden rounded-2 border border-primary">
              <Sample dark={false} />
              <Sample dark />
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="c-secondary text-caption">実際の大きさ</span>
              <RealSize src={image()?.src} />
            </div>
            <Show when={missing()}>
              {(chars) => (
                <p class="c-danger text-caption">
                  描けない文字があります（{chars().join(" ")}
                  ）。使えるのは、かな・漢字（JIS の第 2
                  水準まで）・英数字・記号です。
                </p>
              )}
            </Show>
            <Show when={!missing() && cramped(spec())}>
              <p class="c-secondary text-caption">
                小さく表示された時に読みにくいかもしれません。横長にすると読みやすくなります。
              </p>
            </Show>
          </div>
          <div class="flex min-w-0 flex-col gap-3">
            <TextField
              label="テキスト"
              multiline
              value={text()}
              placeholder={PLACEHOLDER}
              onInput={(value) => {
                // 自動のまま改行を打ったら、打った行を使いたいとみなして自動を切る。
                if (
                  autoBreak() &&
                  value.includes("\n") &&
                  !text().includes("\n")
                ) {
                  setAutoBreak(false);
                }
                setText(value);
              }}
              hint={
                autoBreak()
                  ? `文字数に合わせて改行します。${MAX_CHARS} 字・${MAX_LINES} 行まで。`
                  : `打った改行のとおりに並べます。${MAX_CHARS} 字・${MAX_LINES} 行まで。`
              }
              error={problemMessage(problem())}
            />
            <Switch
              label="自動で改行する"
              checked={autoBreak()}
              onChange={setAutoBreak}
            />
            <Field label="プリセット">
              <div class="grid grid-cols-6 gap-1">
                <For each={PRESETS}>
                  {(preset) => (
                    <PresetButton
                      label={preset.label}
                      selected={presetId() === preset.id}
                      spec={{
                        ...spec(),
                        color: preset.color,
                        outline: autoOutline(preset.color),
                        outlineWidth: preset.outlineWidth,
                        font: preset.font,
                      }}
                      onClick={() => applyPreset(preset.id)}
                    />
                  )}
                </For>
              </div>
            </Field>
            <ColorField
              label="文字の色"
              value={color()}
              onPreview={(hex) => {
                setPresetId(undefined);
                setColor(hex as HexColor);
              }}
              onCommit={(hex) => setColor(hex as HexColor)}
            />
            <Field label="縁取り">
              <SegmentedControl
                label="縁取り"
                block
                variant="secondary"
                value={outlineMode()}
                onChange={(mode) => {
                  setPresetId(undefined);
                  setOutlineMode(mode);
                }}
                options={[
                  { value: "auto", label: "自動" },
                  { value: "pick", label: "色を選ぶ" },
                  { value: "none", label: "なし" },
                ]}
              />
            </Field>
            <Show when={outlineMode() === "pick"}>
              <ColorField
                label="縁取りの色"
                value={outlineColor()}
                onPreview={(hex) => setOutlineColor(hex as HexColor)}
                onCommit={(hex) => setOutlineColor(hex as HexColor)}
              />
            </Show>
            <Field label="フォント">
              <SegmentedControl
                label="フォント"
                block
                variant="secondary"
                value={font()}
                onChange={(id) => {
                  setPresetId(undefined);
                  setFont(id);
                }}
                options={FONT_OPTIONS}
              />
            </Field>
            <div class="grid grid-cols-2 gap-2">
              <Field label="形">
                <SegmentedControl
                  label="形"
                  block
                  variant="secondary"
                  value={spec().shape}
                  onChange={setShape}
                  options={[
                    { value: "square", label: "正方形" },
                    { value: "wide", label: "横長" },
                  ]}
                />
              </Field>
              <Field label="字の形">
                <SegmentedControl
                  label="字の形"
                  block
                  variant="secondary"
                  value={spec().fit}
                  onChange={setFit}
                  options={[
                    { value: "stretch", label: "伸ばす" },
                    { value: "keep", label: "保つ" },
                  ]}
                />
              </Field>
            </div>
            <Show when={spec().fit === "keep" && spec().lines.length > 1}>
              <Field label="そろえ">
                <SegmentedControl
                  label="そろえ"
                  block
                  variant="secondary"
                  value={spec().align}
                  onChange={setAlign}
                  options={[
                    { value: "left", label: "左" },
                    { value: "center", label: "中央" },
                    { value: "right", label: "右" },
                  ]}
                />
              </Field>
            </Show>
            <div class="b-t-1 flex flex-col gap-3 border-primary pt-3">
              <TextField
                label="ショートコード（任意）"
                value={shortcode()}
                placeholder={autoShortcode()}
                onInput={setShortcode}
                hint={
                  replacing()
                    ? `「${finalShortcode()}」はもう自分の絵文字にあります。登録すると、この絵文字に置き換わります。`
                    : "「:名前:」で呼び出すときの名前です。カスタム絵文字を表示できないアプリでは、この名前が文字で出ます。空なら自動で付けます。"
                }
                error={shortcodeError()}
              />
              <Switch
                label="自分の絵文字に登録する"
                checked={register()}
                onChange={setRegister}
              />
            </div>
          </div>
        </div>
      </div>
      <div class="b-t-1 flex shrink-0 justify-end gap-2 border-primary px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => props.onBack()}>
          戻る
        </Button>
        <Show when={register()}>
          <Button
            variant="secondary"
            size="sm"
            disabled={blocked() || text().trim() === ""}
            onClick={() => props.onRegister(spec(), finalShortcode())}
          >
            登録だけする
          </Button>
        </Show>
        <Button
          variant="primary"
          size="sm"
          disabled={blocked() || text().trim() === ""}
          onClick={() =>
            props.onSend(spec(), style(), {
              shortcode: finalShortcode(),
              register: register(),
            })
          }
        >
          {register() ? "登録して送る" : "これで送る"}
        </Button>
      </div>
    </div>
  );
};

const PresetButton: Component<{
  label: string;
  selected: boolean;
  spec: EmojiSpec;
  onClick: () => void;
}> = (props) => {
  const preview = createPreview(() => props.spec);
  const src = () => {
    const value = preview.latest;
    return value?.type === "image" ? value.src : undefined;
  };
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.selected}
      class="grid h-10 cursor-pointer place-items-center rounded-1.5 border bg-secondary"
      classList={{
        "border-accent-primary": props.selected,
        "border-transparent hover:bg-tertiary": !props.selected,
      }}
      onClick={() => props.onClick()}
    >
      <Show when={src()}>
        {(value) => (
          <img
            src={value()}
            alt=""
            draggable={false}
            class="h-7 max-w-full object-contain"
          />
        )}
      </Show>
    </button>
  );
};

/** 「調整する」で開くダイアログ。 */
const MakerDialog: Component<{
  open: boolean;
  initialText: string;
  initialStyle: Style;
  presetId?: string;
  sending?: boolean;
  existingShortcodes: readonly string[];
  onSend: (spec: EmojiSpec, style: Style, submit: MakerSubmit) => void;
  onRegister: (spec: EmojiSpec, shortcode: string) => void;
  onClose: () => void;
}> = (props) => (
  <DialogRoot open={props.open} onClose={() => props.onClose()}>
    <DialogPortal>
      <DialogContent class="w-full max-w-170 rounded-3 border border-primary">
        <div class="flex min-h-12 shrink-0 items-start gap-2 py-3 pr-3 pl-4">
          <DialogTitle class="min-w-0 flex-1 font-600 text-body">
            カスタム絵文字を作る
          </DialogTitle>
          <DialogClose />
        </div>
        <MakerEditor
          initialText={props.initialText}
          initialStyle={props.initialStyle}
          presetId={props.presetId}
          sending={props.sending}
          existingShortcodes={props.existingShortcodes}
          onSend={props.onSend}
          onRegister={props.onRegister}
          onBack={() => props.onClose()}
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
);

export default MakerDialog;
