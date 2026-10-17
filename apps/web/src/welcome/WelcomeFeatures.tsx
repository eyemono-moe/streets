import type { DeckAppearance } from "@streets/core/deck/deck";
import { type Component, For, type ParentComponent, Show } from "solid-js";
import { displayHotkey, keymap } from "../keymap";
import PalettePicker from "../settings/PalettePicker";
import { type ColorScheme, paletteOf } from "../theme";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SegmentedControl from "../ui/SegmentedControl";
import { GUIDE, GuideLink } from "./guide";
import NostrDiagram from "./NostrDiagram";
import ReorderDemo from "./ReorderDemo";

const REPOSITORY = "https://github.com/eyemono-moe/streets";

const COLUMN_KINDS = [
  "ホーム",
  "通知",
  "検索",
  "リスト",
  "チャンネル",
  "ユーザー",
  "ブックマーク",
  "長文記事",
];

const SCHEMES: { value: ColorScheme; label: string }[] = [
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
  { value: "system", label: "端末に合わせる" },
];

const OTHERS = [
  "投稿の日時へタイムスリップして、その前後のタイムラインを見返せる",
  "文字からカスタム絵文字を作れる",
  "カラムをピクチャーインピクチャーで表示して、別の画面を開いていても読める",
];

const Section: ParentComponent<{ id: string; title: string; lead: string }> = (
  props,
) => (
  <section
    class="flex flex-col gap-4 border-primary border-t px-4 py-8"
    aria-labelledby={props.id}
  >
    <div class="flex flex-col gap-3">
      <h2 id={props.id} class="font-700 text-[22px] leading-snug">
        {props.title}
      </h2>
      <p class="c-secondary text-body leading-relaxed">{props.lead}</p>
    </div>
    {props.children}
  </section>
);

const Point: Component<{ title: string; children: string }> = (props) => (
  <div class="flex flex-col gap-1 border-accent-5 border-l-3 pl-3">
    <h3 class="font-600 text-body">{props.title}</h3>
    <p class="c-secondary text-caption leading-relaxed">{props.children}</p>
  </div>
);

const Card: ParentComponent<{ title: string }> = (props) => (
  <div class="flex flex-col gap-3 rounded-3 border border-primary p-3">
    <h3 class="font-600 text-caption">{props.title}</h3>
    {props.children}
  </div>
);

const Key: Component<{ children: string }> = (props) => (
  <kbd class="min-w-16 shrink-0 rounded-1.5 border border-control bg-secondary px-2 py-0.5 text-center font-mono text-caption">
    {props.children}
  </kbd>
);

const AboutLink: Component<{ page?: string; children: string }> = (props) => {
  const dispatch = useDispatch();
  return (
    <button
      type="button"
      class="cursor-pointer bg-transparent p-0 text-caption text-link"
      onClick={() => dispatch({ type: "deck/open-about", page: props.page })}
    >
      {props.children}
    </button>
  );
};

/**
 * 紹介のカラムの、始め方より下。Streets の大きな特徴を 3 つに分けて見せ、
 * 細かい機能は最後に 1 行ずつ並べる。
 */
const WelcomeFeatures: Component<{
  scheme: ColorScheme;
  appearance: DeckAppearance;
  /** キーボードの操作を見せる。狭い画面やタッチの端末では見せない。 */
  keyboard: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <>
      <Section
        id="welcome-nostr"
        title="Nostrのアカウントで使える"
        lead="Streetsは、分散型SNSの共通規格「Nostr」を使ったアプリです。投稿は「リレー」と呼ばれるサーバーに保存され、複数のアプリから閲覧できます。"
      >
        <NostrDiagram />
        <Point title="ほかのアプリでも使える">
          ほかのNostrアプリでも同じアカウントでログインできます。フォローしている人の一覧も引き継がれます。
        </Point>
        <Point title="相手の投稿先を探して読む">
          Streetsは、フォロー中の人が投稿に使っているリレーを調べ、そこから読み取ります。
        </Point>
        <p class="text-caption">
          <GuideLink href={GUIDE}>Nostr について詳しく知る</GuideLink>
        </p>
      </Section>

      <Section
        id="welcome-columns"
        title="見たいものを並べる"
        lead="ホーム、通知、検索などをカラムに追加できます。"
      >
        <ul class="flex flex-wrap gap-2" aria-label="カラムの種類">
          <For each={COLUMN_KINDS}>
            {(kind) => (
              <li class="rounded-full border border-control px-3 py-1 text-caption">
                {kind}
              </li>
            )}
          </For>
        </ul>
        <Button
          variant="primary"
          block
          icon="i-material-symbols:add-rounded"
          onClick={() =>
            dispatch({ type: "deck/open-panel", panel: "add-column" })
          }
        >
          カラムを足してみる
        </Button>
        <ReorderDemo />
      </Section>

      <Section
        id="welcome-custom"
        title="見やすく、操作しやすく"
        lead="カラーテーマやショートカットキーを柔軟に変更できます。"
      >
        <Card title="カラーテーマ">
          <PalettePicker
            value={paletteOf(props.appearance)}
            onChange={(palette) =>
              dispatch({
                type: "deck/set-appearance",
                appearance: { accent: palette.accent, ui: palette.ui },
              })
            }
          />
          <SegmentedControl
            label="明るさ"
            variant="secondary"
            block
            options={SCHEMES}
            value={props.scheme}
            onChange={(scheme) =>
              dispatch({ type: "deck/set-color-scheme", scheme })
            }
          />
        </Card>
        <Show when={props.keyboard}>
          <Card title="キーボードでも操作">
            <dl class="flex flex-col gap-2 text-caption">
              <div class="flex items-center gap-3">
                <dt>
                  <Key>1–9</Key>
                </dt>
                <dd>左から1〜9番目のカラムに移動</dd>
              </div>
              <div class="flex items-center gap-3">
                <dt>
                  <Key>{displayHotkey(keymap().palette)}</Key>
                </dt>
                <dd>
                  <button
                    type="button"
                    class="cursor-pointer bg-transparent p-0 text-link"
                    onClick={() => dispatch({ type: "deck/open-palette" })}
                  >
                    機能を名前で探して開く
                  </button>
                </dd>
              </div>
              <div class="flex items-center gap-3">
                <dt>
                  <Key>設定</Key>
                </dt>
                <dd>
                  <button
                    type="button"
                    class="cursor-pointer bg-transparent p-0 text-link"
                    onClick={() =>
                      dispatch({
                        type: "deck/open-settings",
                        setting: "shortcuts",
                      })
                    }
                  >
                    よく使う操作のキーを変更
                  </button>
                </dd>
              </div>
            </dl>
          </Card>
        </Show>
      </Section>

      <section
        class="flex flex-col gap-3 border-primary border-t px-4 py-8"
        aria-labelledby="welcome-others"
      >
        <h2 id="welcome-others" class="font-700 text-body">
          ほかにも
        </h2>
        <ul class="flex flex-col gap-2 text-caption">
          <For each={OTHERS}>{(item) => <li>・{item}</li>}</For>
        </ul>
      </section>

      <nav
        class="flex flex-wrap gap-x-4 gap-y-1 border-primary border-t px-4 py-6"
        aria-label="Streets の情報"
      >
        <AboutLink>Streets について</AboutLink>
        <AboutLink page="nips">対応している NIP</AboutLink>
        <a
          href={REPOSITORY}
          target="_blank"
          rel="noopener noreferrer"
          class="text-caption text-link"
        >
          GitHub
        </a>
        <AboutLink page="releases">リリースノート</AboutLink>
      </nav>
    </>
  );
};

export default WelcomeFeatures;
