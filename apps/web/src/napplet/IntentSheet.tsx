import { type Component, For, Show, createSignal } from "solid-js";
import Button from "../ui/Button";
import ChoiceButton from "../ui/ChoiceButton";
import UiSwitch from "../ui/Switch";
import ColumnSheet from "./ColumnSheet";

/** 役割（archetype）の呼び名。知らない役割は、そのまま出す。 */
const ARCHETYPE_LABELS: Record<string, string> = {
  profile: "プロフィール",
  note: "投稿",
  article: "長文の記事",
  composer: "投稿欄",
  highlight: "ハイライト",
  feed: "フィード",
  dm: "ダイレクトメッセージ",
  map: "地図",
};

export const archetypeLabel = (archetype: string): string =>
  ARCHETYPE_LABELS[archetype] ?? archetype;

/** その役割を Streets で受けるときの呼び名。投稿欄はカラムではない。 */
export const streetsHandlerLabel = (archetype: string): string =>
  archetype === "composer" ? "Streets の投稿欄" : "Streets のカラム";

export type IntentSheetCandidate = {
  id: string;
  title: string;
  /** Streets（カラムや投稿欄）で開くもの。 */
  streets: boolean;
};

export type IntentSheetProps = {
  /** 頼んだアップレットの名前。 */
  source: string;
  archetype: string;
  /**
   * `choose` は受け手を選ばせる。`confirm` は受け手が決まっているが、そのカラムが
   * 直前に押されていないので、開いてよいか確かめる。
   */
  mode: "choose" | "confirm";
  candidates: readonly IntentSheetCandidate[];
  /** 勧められたが、まだインストールしていないアップレット。 */
  suggested?: { title: string };
  onPick: (id: string, always: boolean) => void;
  onInstall: (always: boolean) => void;
  onCancel: () => void;
};

/**
 * アップレットから「開いて」と頼まれたときに、頼んだカラムの中に出すシート。カラムの
 * 下から出し、選ぶまでそのカラムを触れなくする（どのカラムが頼んだのかが見て分かる）。
 */
const IntentSheet: Component<IntentSheetProps> = (props) => {
  const [always, setAlways] = createSignal(false);
  const label = () => archetypeLabel(props.archetype);
  return (
    <ColumnSheet
      label={`${props.source} からの依頼`}
      source={props.source}
      title={
        <>
          {props.mode === "confirm" && props.candidates[0]
            ? `${props.candidates[0].title} で${label()}を開こうとしています`
            : `${label()}を開こうとしています。どれで開きますか？`}
        </>
      }
      onCancel={() => props.onCancel()}
    >
      <div class="flex flex-col gap-2">
        <Show when={props.suggested}>
          {(suggested) => (
            <ChoiceButton
              icon="i-material-symbols:download-rounded"
              title={`${suggested().title} をインストールして開く`}
              description="頼んだアップレットが勧めています。まだインストールしていません"
              onClick={() => props.onInstall(always())}
            />
          )}
        </Show>
        <For each={props.candidates}>
          {(candidate) => (
            <ChoiceButton
              icon={
                candidate.streets
                  ? "i-material-symbols:view-column-outline-rounded"
                  : "i-material-symbols:widgets-outline-rounded"
              }
              title={candidate.title}
              description={
                candidate.streets
                  ? `${streetsHandlerLabel(props.archetype)}で開く`
                  : "インストール済みのアップレットで開く"
              }
              onClick={() => props.onPick(candidate.id, always())}
            />
          )}
        </For>
      </div>
      <Show
        when={props.mode === "choose"}
        fallback={
          <p class="c-secondary text-caption">
            このカラムが直前に押されていないため、開く前に確かめています。
          </p>
        }
      >
        <UiSwitch
          label={`${label()}は、いつもこれで開く`}
          checked={always()}
          onChange={setAlways}
        />
      </Show>
      <div class="flex justify-end">
        <Button onClick={() => props.onCancel()}>やめる</Button>
      </div>
    </ColumnSheet>
  );
};

export default IntentSheet;
