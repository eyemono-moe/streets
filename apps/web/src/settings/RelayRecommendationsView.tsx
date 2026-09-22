import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
import { type RelayUsage, relayLabel } from "@streets/core/settings/relay-edit";
import type {
  RecommendationReason,
  RelayRecommendation,
} from "@streets/core/settings/relay-recommendation";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createSignal,
} from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SegmentedControl from "../ui/SegmentedControl";
import RelaySummary from "./RelaySummary";
import SettingsSection from "./SettingsSection";

/** 候補の集まり具合。取得中と、候補が無いことを分ける。 */
export type RecommendationState =
  | { phase: "loading" }
  | { phase: "no-followees" }
  | { phase: "empty" }
  | {
      phase: "ready";
      items: readonly RelayRecommendation[];
      /** NIP-66 の計測。`missing` は、問い合わせたが 1 件も得られなかった。 */
      discovery: "loading" | "ready" | "missing";
    };

export type RelayRecommendationsViewProps = {
  state: RecommendationState;
  infoOf?: (url: RelayUrl) => RelayInfo | undefined;
};

/** おすすめのリレー。足すときはイベントを上へ渡す（`relays/edit`）。 */
const RelayRecommendationsView: Component<RelayRecommendationsViewProps> = (
  props,
) => (
  <SettingsSection
    title="おすすめのリレー"
    description="フォローしている人がよく使っているリレーの一覧です。"
  >
    <Switch>
      <Match when={props.state.phase === "loading"}>
        <p class="c-secondary text-caption">
          フォローしている人のリレーを集めています…
        </p>
      </Match>
      <Match when={props.state.phase === "no-followees"}>
        <Notice>フォローしている人がいないので、おすすめを出せません。</Notice>
      </Match>
      <Match when={props.state.phase === "empty"}>
        <Notice>
          フォローしている人のリレーの設定が見つからなかったので、おすすめを出せません。
        </Notice>
      </Match>
      <Match when={props.state.phase === "ready" && props.state}>
        {(state) => (
          <>
            <Switch>
              <Match when={state().discovery === "loading"}>
                <p class="c-secondary text-caption">
                  応答の速さと対応している機能を調べています…
                </p>
              </Match>
              <Match when={state().discovery === "missing"}>
                <p class="c-secondary text-caption">
                  応答の速さと対応している機能は分からなかったので、使っている人の数だけで並べています。
                </p>
              </Match>
            </Switch>
            <ul class="flex flex-col overflow-hidden rounded-2 border border-primary [&>*+*]:border-t [&>*]:border-primary">
              <For each={state().items}>
                {(item) => (
                  <RecommendationRow
                    item={item}
                    info={props.infoOf?.(item.url)}
                    loadInfo={props.infoOf === undefined}
                  />
                )}
              </For>
            </ul>
          </>
        )}
      </Match>
    </Switch>
  </SettingsSection>
);

const Notice: Component<{ children: string }> = (props) => (
  <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
    {props.children}
  </p>
);

const USAGES: { value: RelayUsage; label: string; icon: string }[] = [
  {
    value: "both",
    label: "両方",
    icon: "i-material-symbols:swap-vert-rounded",
  },
  {
    value: "read",
    label: "読み込み",
    icon: "i-material-symbols:download-rounded",
  },
  {
    value: "write",
    label: "書き込み",
    icon: "i-material-symbols:upload-rounded",
  },
];

const RecommendationRow: Component<{
  item: RelayRecommendation;
  info: RelayInfo | undefined;
  loadInfo: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const [usage, setUsage] = createSignal<RelayUsage>("both");
  const label = () => relayLabel(props.item.url);

  return (
    <li class="bg-primary">
      <RelaySummary
        url={props.item.url}
        info={props.info}
        loadInfo={props.loadInfo}
        subtitle={
          <span class="flex flex-col gap-0.5 pt-0.5">
            <span class="c-primary font-600 text-caption">
              おすすめ度 {props.item.score}
            </span>
            <span class="flex flex-wrap gap-x-2 gap-y-0.5">
              <For each={props.item.reasons}>
                {(reason) => (
                  <span class="c-secondary text-caption">
                    {reasonLabel(reason)}
                  </span>
                )}
              </For>
            </span>
          </span>
        }
        actions={
          <div class="ml-auto flex items-center gap-1">
            <Show
              when={!props.item.added}
              fallback={
                <span class="c-secondary flex items-center gap-1 text-caption">
                  <span
                    class="i-material-symbols:check-rounded size-4"
                    aria-hidden="true"
                  />
                  使っています
                </span>
              }
            >
              <SegmentedControl
                label={`${label()} の使い方`}
                variant="secondary"
                value={usage()}
                options={USAGES}
                onChange={setUsage}
              />
              <Button
                variant="primary"
                size="sm"
                icon="i-material-symbols:add-rounded"
                aria-label={`${label()} を使うリレーに足す`}
                onClick={() =>
                  dispatch({
                    type: "relays/edit",
                    op: { type: "add", url: props.item.url, usage: usage() },
                  })
                }
              >
                追加
              </Button>
            </Show>
          </div>
        }
      />
    </li>
  );
};

const NIP_NAMES: Record<number, string> = {
  1: "基本の読み書き",
  9: "削除",
  11: "リレーの情報",
};

const reasonLabel = (reason: RecommendationReason): string => {
  switch (reason.type) {
    case "users":
      return `フォロー中の ${reason.users} 人が使用`;
    case "latency":
      return `応答 ${reason.ms}ms`;
    case "nips":
      return reason.missing.length === 0
        ? "必要な機能に対応"
        : `${reason.missing.map((nip) => NIP_NAMES[nip] ?? `NIP-${nip}`).join("・")}に未対応`;
    case "payment":
      return "書き込みに支払いが必要";
    case "auth":
      return "ログインが必要";
  }
};

export default RelayRecommendationsView;
