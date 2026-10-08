import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
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
import Button from "../ui/Button";
import RelaySummary from "./RelaySummary";
import RelayUseButton from "./RelayUseButton";
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

/**
 * はじめに見せるおすすめの数。候補は 30 件まで集めるが、全部並べると下の
 * 設定が画面の外へ押し出される。
 */
const FIRST_RECOMMENDATIONS = 5;

/** おすすめのリレー。足すときはイベントを上へ渡す（`relays/edit`）。 */
const RelayRecommendationsView: Component<RelayRecommendationsViewProps> = (
  props,
) => {
  const [showAll, setShowAll] = createSignal(false);
  return (
    <SettingsSection
      id="relayRecommendations"
      description="フォローしている人がよく使っているリレーの一覧です。"
    >
      <Switch>
        <Match when={props.state.phase === "loading"}>
          <p class="c-secondary text-caption">
            フォローしている人のリレーを集めています…
          </p>
        </Match>
        <Match when={props.state.phase === "no-followees"}>
          <Notice>
            フォローしている人がいないので、おすすめを出せません。
          </Notice>
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
                <For
                  each={
                    showAll()
                      ? state().items
                      : state().items.slice(0, FIRST_RECOMMENDATIONS)
                  }
                >
                  {(item) => (
                    <RecommendationRow
                      item={item}
                      info={props.infoOf?.(item.url)}
                      loadInfo={props.infoOf === undefined}
                    />
                  )}
                </For>
              </ul>
              <Show
                when={
                  !showAll() && state().items.length > FIRST_RECOMMENDATIONS
                }
              >
                <Button
                  variant="ghost"
                  size="sm"
                  icon="i-material-symbols:expand-more-rounded"
                  onClick={() => setShowAll(true)}
                >
                  {`残り ${state().items.length - FIRST_RECOMMENDATIONS} 件を見る`}
                </Button>
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </SettingsSection>
  );
};

const Notice: Component<{ children: string }> = (props) => (
  <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
    {props.children}
  </p>
);

const RecommendationRow: Component<{
  item: RelayRecommendation;
  info: RelayInfo | undefined;
  loadInfo: boolean;
}> = (props) => {
  return (
    <li class="bg-primary">
      <RelaySummary
        url={props.item.url}
        info={props.info}
        loadInfo={props.loadInfo}
        subtitle={
          <span class="flex flex-col gap-0.5 pt-0.5">
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
            <RelayUseButton url={props.item.url} />
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
