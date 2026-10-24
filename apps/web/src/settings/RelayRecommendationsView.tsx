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
import { t, plural } from "../i18n/locale";
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
      description={t("settings.recommendations.description")}
    >
      <Switch>
        <Match when={props.state.phase === "loading"}>
          <p class="c-secondary text-caption">
            {t("settings.recommendations.collecting")}
          </p>
        </Match>
        <Match when={props.state.phase === "no-followees"}>
          <Notice>{t("settings.recommendations.noFollowees")}</Notice>
        </Match>
        <Match when={props.state.phase === "empty"}>
          <Notice>{t("settings.recommendations.empty")}</Notice>
        </Match>
        <Match when={props.state.phase === "ready" && props.state}>
          {(state) => (
            <>
              <Switch>
                <Match when={state().discovery === "loading"}>
                  <p class="c-secondary text-caption">
                    {t("settings.recommendations.discovering")}
                  </p>
                </Match>
                <Match when={state().discovery === "missing"}>
                  <p class="c-secondary text-caption">
                    {t("settings.recommendations.discoveryMissing")}
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
                  {t("settings.recommendations.showMore", {
                    count: state().items.length - FIRST_RECOMMENDATIONS,
                  })}
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

const nipName = (nip: number): string => {
  switch (nip) {
    case 1:
      return t("settings.recommendations.nips.basic");
    case 9:
      return t("settings.recommendations.nips.deletion");
    case 11:
      return t("settings.recommendations.nips.info");
    default:
      return `NIP-${nip}`;
  }
};

const reasonLabel = (reason: RecommendationReason): string => {
  switch (reason.type) {
    case "users":
      return plural("settings.recommendations.reason.users", reason.users);
    case "latency":
      return t("settings.recommendations.reason.latency", { ms: reason.ms });
    case "nips":
      return reason.missing.length === 0
        ? t("settings.recommendations.reason.nipsOk")
        : t("settings.recommendations.reason.nipsMissing", {
            nips: reason.missing
              .map(nipName)
              .join(t("settings.recommendations.separator")),
          });
    case "payment":
      return t("settings.recommendations.reason.payment");
    case "auth":
      return t("settings.recommendations.reason.auth");
  }
};

export default RelayRecommendationsView;
