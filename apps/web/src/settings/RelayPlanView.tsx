import type { RelayStatus } from "@streets/core/read/connection-pool";
import type { ReadPlan, ReadPlanRelay } from "@streets/core/read/read-plan";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
import { type Component, For, type JSX, Show } from "solid-js";
import RelaySummary from "./RelaySummary";
import SettingsSection from "./SettingsSection";

export type RelayPlanViewProps = {
  /** 全カラム分の読み取り先。読み取り層が無い（ログイン直後など）ときは undefined。 */
  plan: ReadPlan | undefined;
  /** フォロー中の人のリレー設定を探し終えたか。探している間の「見つからない」は欠落ではない。 */
  routingSettled: boolean;
  /** 自分の一覧。理由の「あなたの読み込みリレー」と、書き込み先に使う。 */
  entries: readonly RelayListEntry[];
  /** 自分の一覧をまだ取りに行っている途中。 */
  loading: boolean;
  /** 書き込みリレーが無い人の送り先。 */
  fallback: readonly RelayUrl[];
  statusOf: (url: RelayUrl) => RelayStatus;
  infoOf?: (url: RelayUrl) => RelayInfo | undefined;
};

/** Outbox が実際に選んだ読み書きの先を、理由と一緒に並べる。 */
const RelayPlanView: Component<RelayPlanViewProps> = (props) => {
  const readUrls = () =>
    new Set(props.entries.filter((entry) => entry.read).map((e) => e.url));
  const writeTargets = () => {
    const own = props.entries.filter((entry) => entry.write);
    return own.length > 0
      ? own.map((entry) => ({ url: entry.url, fallback: false }))
      : props.fallback.map((url) => ({ url, fallback: true }));
  };

  return (
    <SettingsSection
      title="いま使っているリレー"
      description="投稿を読むために、いまつないでいるリレーと、その理由です。フォローしている人ごとにリレーを選んでいるときは、上の一覧に無いリレーもここに並びます。"
    >
      <h4 class="c-secondary font-600 text-caption">読み込み</h4>
      <Show
        when={props.plan}
        fallback={<p class="c-secondary text-caption">読み込み中…</p>}
      >
        {(plan) => (
          <>
            <PlanNotes plan={plan()} routingSettled={props.routingSettled} />
            <Show
              when={plan().relays.length > 0}
              fallback={
                <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
                  いまはどのリレーからも読んでいません。
                </p>
              }
            >
              <RelayList>
                <For each={plan().relays}>
                  {(relay) => (
                    <li class="bg-primary">
                      <RelaySummary
                        url={relay.url}
                        info={props.infoOf?.(relay.url)}
                        loadInfo={props.infoOf === undefined}
                        status={props.statusOf(relay.url)}
                        subtitle={
                          <span class="c-secondary text-caption">
                            {readReason(plan().mode, relay, readUrls())}
                          </span>
                        }
                      />
                    </li>
                  )}
                </For>
              </RelayList>
            </Show>
          </>
        )}
      </Show>

      <h4 class="c-secondary mt-2 font-600 text-caption">書き込み</h4>
      <Show
        when={!props.loading}
        fallback={<p class="c-secondary text-caption">読み込み中…</p>}
      >
        <RelayList>
          <For each={writeTargets()}>
            {(target) => (
              <li class="bg-primary">
                <RelaySummary
                  url={target.url}
                  info={props.infoOf?.(target.url)}
                  loadInfo={props.infoOf === undefined}
                  status={props.statusOf(target.url)}
                  subtitle={
                    <span class="c-secondary text-caption">
                      {target.fallback
                        ? "書き込みにしたリレーが無いので、既定のリレーへ送っています"
                        : "あなたの書き込みリレー"}
                    </span>
                  }
                />
              </li>
            )}
          </For>
        </RelayList>
      </Show>
    </SettingsSection>
  );
};

const RelayList = (props: { children: JSX.Element }) => (
  <ul class="flex flex-col overflow-hidden rounded-2 border border-primary [&>*+*]:border-t [&>*]:border-primary">
    {props.children}
  </ul>
);

const readReason = (
  mode: ReadPlan["mode"],
  relay: ReadPlanRelay,
  ownRead: ReadonlySet<RelayUrl>,
): string => {
  const reasons: string[] = [];
  if (mode === "direct" && (relay.authors > 0 || !relay.explicit)) {
    reasons.push("あなたの読み込みリレー");
  } else if (relay.authors > 0) {
    reasons.push(`${relay.authors} 人が書き込みに使っている`);
  }
  if (relay.fallback) {
    reasons.push("リレーの設定が分からない人のための既定のリレー");
  }
  if (relay.explicit) {
    reasons.push(
      ownRead.has(relay.url)
        ? "あなたの読み込みリレー（通知など）"
        : "カラムで指定したリレー",
    );
  }
  return [...new Set(reasons)].join("・");
};

const PlanNotes: Component<{ plan: ReadPlan; routingSettled: boolean }> = (
  props,
) => (
  <>
    <Show when={props.plan.unroutableAuthors > 0}>
      <p class="c-secondary text-caption">
        {props.routingSettled
          ? `${props.plan.unroutableAuthors} 人はリレーの設定が見つからないので、既定のリレーから読んでいます。`
          : `${props.plan.unroutableAuthors} 人のリレーの設定を探しています。見つかるまでは既定のリレーから読みます。`}
      </p>
    </Show>
    <Show when={props.plan.uncoveredAuthors > 0}>
      <p class="c-secondary flex items-start gap-1 text-caption">
        <span
          class="i-material-symbols:warning-outline-rounded c-status-warn mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        {`${props.plan.uncoveredAuthors} 人は、同時につなげるリレーの数に収まらないか、その人のリレーにつながらないため、どこからも読めていません。`}
      </p>
    </Show>
  </>
);

export default RelayPlanView;
