import { Collapsible } from "@ark-ui/solid/collapsible";
import type { RelayStatus } from "@streets/core/read/connection-pool";
import type { ReadPlan, ReadPlanRelay } from "@streets/core/read/read-plan";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
import { relayLabel } from "@streets/core/settings/relay-edit";
import {
  type Component,
  For,
  type JSX,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
} from "solid-js";
import { t, plural } from "../i18n/locale";
import Avatar from "../note/Avatar";
import UserLink from "../note/UserLink";
import Button from "../ui/Button";
import SearchInput from "../ui/SearchInput";
import SegmentedControl from "../ui/SegmentedControl";
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
  /** その人が書き込みに使うと公開しているリレーの数。 */
  declaredRelayCount: (pubkey: string) => number;
  /** 人ごとの一覧を名前で探すときに使う名前。 */
  nameOf: (pubkey: string) => string;
  /** 開いたときの並べ方。 */
  defaultGrouping?: Grouping;
};

type Grouping = "relay" | "person";

const groupings = (): { value: Grouping; label: string }[] => [
  { value: "relay", label: t("settings.relayPlan.groupByRelay") },
  { value: "person", label: t("settings.relayPlan.groupByPerson") },
];

/** 一覧に最初に描く人数。フォローが数千人でも、開いた瞬間に全員を描かない。 */
const FIRST_PAGE = 50;
const NEXT_PAGE = 100;
const STACKED = 5;

/** Outbox が実際に選んだ読み書きの先を、理由と一緒に並べる。 */
const RelayPlanView: Component<RelayPlanViewProps> = (props) => {
  const [grouping, setGrouping] = createSignal<Grouping>(
    props.defaultGrouping ?? "relay",
  );
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
      id="relayPlan"
      description={t("settings.relayPlan.description")}
    >
      <h4 class="c-secondary font-600 text-caption">
        {t("settings.relayPlan.read")}
      </h4>
      <Show
        when={props.plan}
        fallback={
          <p class="c-secondary text-caption">{t("settings.relays.loading")}</p>
        }
      >
        {(plan) => (
          <>
            <Show when={plan().mode === "outbox"}>
              <SegmentedControl
                label={t("settings.relayPlan.groupingLabel")}
                variant="secondary"
                block
                value={grouping()}
                options={groupings()}
                onChange={setGrouping}
              />
            </Show>
            <Switch>
              <Match when={plan().mode === "outbox" && grouping() === "person"}>
                <PersonPlan
                  plan={plan()}
                  routingSettled={props.routingSettled}
                  fallback={props.fallback}
                  declaredRelayCount={props.declaredRelayCount}
                  nameOf={props.nameOf}
                />
              </Match>
              <Match when={true}>
                <PlanNotes
                  plan={plan()}
                  routingSettled={props.routingSettled}
                  fallback={props.fallback}
                />
                <Show
                  when={plan().relays.length > 0}
                  fallback={
                    <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
                      {t("settings.relayPlan.readingNone")}
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
                              <span class="c-secondary flex min-w-0 items-center gap-1.5 text-caption">
                                <Show when={relay.authors.length > 0}>
                                  <AvatarStack pubkeys={relay.authors} />
                                </Show>
                                <span class="min-w-0">
                                  {readReason(plan().mode, relay, readUrls())}
                                </span>
                              </span>
                            }
                            details={
                              relay.authors.length > 0
                                ? () => (
                                    <div class="flex flex-col gap-1 px-3 pb-3 pl-14">
                                      <h5 class="c-secondary font-600 text-caption">
                                        {t("settings.relayPlan.writers")}
                                      </h5>
                                      <PeopleList pubkeys={relay.authors} />
                                    </div>
                                  )
                                : undefined
                            }
                          />
                        </li>
                      )}
                    </For>
                  </RelayList>
                </Show>
              </Match>
            </Switch>
          </>
        )}
      </Show>

      <h4 class="c-secondary mt-2 font-600 text-caption">
        {t("settings.relayPlan.write")}
      </h4>
      <Show
        when={!props.loading}
        fallback={
          <p class="c-secondary text-caption">{t("settings.relays.loading")}</p>
        }
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
                        ? t("settings.relayPlan.writeFallback")
                        : t("settings.relayPlan.writeOwn")}
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
  if (mode === "direct" && (relay.authors.length > 0 || !relay.explicit)) {
    reasons.push(t("settings.relayPlan.reason.ownRead"));
  } else if (relay.authors.length > 0) {
    reasons.push(
      plural("settings.relayPlan.reason.writers", relay.authors.length),
    );
  }
  if (relay.fallback) {
    reasons.push(t("settings.relayPlan.reason.fallback"));
  }
  if (relay.explicit) {
    reasons.push(
      ownRead.has(relay.url)
        ? t("settings.relayPlan.reason.ownReadNotifications")
        : t("settings.relayPlan.reason.column"),
    );
  }
  return [...new Set(reasons)].join(t("settings.relayPlan.reason.separator"));
};

const hostOf = (url: RelayUrl) => relayLabel(url).replace(/^wss?:\/\//, "");

/** 先頭の数人のアイコンを重ねる。押すのは行（開くと全員が見える）で、アイコンではない。 */
const AvatarStack: Component<{ pubkeys: readonly string[] }> = (props) => (
  <span class="flex shrink-0 items-center" aria-hidden="true">
    <For each={props.pubkeys.slice(0, STACKED)}>
      {(pubkey, index) => (
        <span
          class="flex rounded-1.5 ring-2 ring-white dark:ring-ui-950"
          classList={{ "-ml-1.5": index() > 0 }}
        >
          <Avatar pubkey={pubkey} size="tiny" static />
        </span>
      )}
    </For>
    <Show when={props.pubkeys.length > STACKED}>
      <span class="c-secondary ml-1 text-caption">
        +{props.pubkeys.length - STACKED}
      </span>
    </Show>
  </span>
);

/**
 * 人の一覧。高さを決めてその中で流し、最初は `FIRST_PAGE` 人だけ描く ——
 * フォローが多いと、開くたびに全員のアイコンと名刺を作ることになる。
 */
const PeopleList: Component<{
  pubkeys: readonly string[];
  detail?: (pubkey: string) => JSX.Element;
}> = (props) => {
  const [shown, setShown] = createSignal(FIRST_PAGE);
  const rest = () => props.pubkeys.length - shown();
  return (
    <div class="flex max-h-80 flex-col overflow-y-auto">
      <ul class="flex flex-col">
        <For each={props.pubkeys.slice(0, shown())}>
          {(pubkey) => (
            <li
              class="flex min-w-0 gap-2 py-1.5"
              classList={{
                "items-start": props.detail !== undefined,
                "items-center": props.detail === undefined,
              }}
            >
              <Avatar pubkey={pubkey} size="compact" />
              <div class="flex min-w-0 flex-1 flex-col">
                <UserLink
                  pubkey={pubkey}
                  class="c-primary min-w-0 truncate font-600 text-caption"
                />
                {props.detail?.(pubkey)}
              </div>
            </li>
          )}
        </For>
      </ul>
      <Show when={rest() > 0}>
        <div class="py-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShown((n) => n + NEXT_PAGE)}
          >
            {t("settings.relayPlan.showMore", { count: rest() })}
          </Button>
        </div>
      </Show>
    </div>
  );
};

/** 開くと人の一覧が見える知らせ。 */
const PeopleNotice: Component<{
  pubkeys: readonly string[];
  warn?: boolean;
  children: JSX.Element;
  detail?: (pubkey: string) => JSX.Element;
}> = (props) => (
  <Collapsible.Root
    lazyMount
    unmountOnExit
    class="rounded-2 border border-primary"
  >
    <Collapsible.Trigger class="group flex w-full items-center gap-2 bg-transparent px-3 py-2.5 text-left enabled:cursor-pointer">
      <Show when={props.warn}>
        <span
          class="i-material-symbols:warning-outline-rounded c-status-warn size-4 shrink-0"
          aria-hidden="true"
        />
      </Show>
      <AvatarStack pubkeys={props.pubkeys} />
      <span class="c-secondary min-w-0 flex-1 text-caption">
        {props.children}
      </span>
      <span
        class="i-material-symbols:expand-more-rounded c-secondary size-4.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </Collapsible.Trigger>
    <Collapsible.Content class="motion-collapse">
      <div class="border-t border-primary px-3 py-1">
        <PeopleList pubkeys={props.pubkeys} detail={props.detail} />
      </div>
    </Collapsible.Content>
  </Collapsible.Root>
);

const fallbackHosts = (fallback: readonly RelayUrl[]) =>
  fallback.map(hostOf).join(t("settings.relayPlan.reason.separator"));

const PlanNotes: Component<{
  plan: ReadPlan;
  routingSettled: boolean;
  fallback: readonly RelayUrl[];
}> = (props) => (
  <>
    <Show when={props.plan.unroutableAuthors.length > 0}>
      <PeopleNotice pubkeys={props.plan.unroutableAuthors}>
        {props.routingSettled
          ? props.fallback.length > 0
            ? plural(
                "settings.relayPlan.notes.unroutableWithRelays",
                props.plan.unroutableAuthors.length,
                { relays: fallbackHosts(props.fallback) },
              )
            : plural(
                "settings.relayPlan.notes.unroutable",
                props.plan.unroutableAuthors.length,
              )
          : plural(
              "settings.relayPlan.notes.unroutableSearching",
              props.plan.unroutableAuthors.length,
            )}
      </PeopleNotice>
    </Show>
    <Show when={props.plan.uncoveredAuthors.length > 0}>
      <PeopleNotice pubkeys={props.plan.uncoveredAuthors} warn>
        {plural(
          "settings.relayPlan.notes.uncovered",
          props.plan.uncoveredAuthors.length,
        )}
      </PeopleNotice>
    </Show>
  </>
);

/** 人ごとに、どのリレーから読んでいるかを並べる。読めていない人を先に置く。 */
const PersonPlan: Component<{
  plan: ReadPlan;
  routingSettled: boolean;
  fallback: readonly RelayUrl[];
  declaredRelayCount: (pubkey: string) => number;
  nameOf: (pubkey: string) => string;
}> = (props) => {
  const [query, setQuery] = createSignal("");
  const assigned = createMemo(() => {
    const byAuthor = new Map<string, RelayUrl[]>();
    for (const relay of props.plan.relays) {
      for (const author of relay.authors) {
        const urls = byAuthor.get(author);
        if (urls) urls.push(relay.url);
        else byAuthor.set(author, [relay.url]);
      }
    }
    return byAuthor;
  });
  const matches = (pubkeys: Iterable<string>) => {
    const needle = query().trim().toLowerCase();
    const all = [...pubkeys];
    if (needle === "") return all;
    return all.filter(
      (pubkey) =>
        props.nameOf(pubkey).toLowerCase().includes(needle) ||
        pubkey.startsWith(needle),
    );
  };
  const unroutable = () => matches(props.plan.unroutableAuthors);
  const uncovered = () => matches(props.plan.uncoveredAuthors);
  const routed = () => matches(assigned().keys());
  const nothing = () =>
    unroutable().length === 0 &&
    uncovered().length === 0 &&
    routed().length === 0;

  return (
    <>
      <SearchInput
        label={t("settings.relayPlan.searchLabel")}
        placeholder={t("settings.relayPlan.searchLabel")}
        clearable
        value={query()}
        onValueChange={setQuery}
      />
      <Show when={unroutable().length > 0}>
        <PersonGroup
          title={t("settings.relayPlan.groups.unroutable")}
          pubkeys={unroutable()}
          note={
            props.routingSettled
              ? props.fallback.length > 0
                ? t("settings.relayPlan.groups.unroutableNoteWithRelays", {
                    relays: fallbackHosts(props.fallback),
                  })
                : t("settings.relayPlan.groups.unroutableNote")
              : t("settings.relayPlan.groups.unroutableSearching")
          }
        />
      </Show>
      <Show when={uncovered().length > 0}>
        <PersonGroup
          title={t("settings.relayPlan.groups.uncovered")}
          warn
          pubkeys={uncovered()}
          detail={(pubkey) => (
            <span class="c-secondary text-caption">
              {plural(
                "settings.relayPlan.groups.uncoveredDetail",
                props.declaredRelayCount(pubkey),
              )}
            </span>
          )}
        />
      </Show>
      <Show when={routed().length > 0}>
        <PersonGroup
          title={t("settings.relayPlan.groups.routed")}
          pubkeys={routed()}
          detail={(pubkey) => {
            const urls = assigned().get(pubkey) ?? [];
            const declared = props.declaredRelayCount(pubkey);
            return (
              <span class="flex min-w-0 flex-col gap-1">
                <span class="flex flex-wrap gap-1">
                  <For each={urls}>
                    {(url) => (
                      <span class="c-primary rounded-1.5 bg-secondary px-1.5 text-caption break-all">
                        {hostOf(url)}
                      </span>
                    )}
                  </For>
                </span>
                <span class="c-secondary text-caption">
                  {declared > urls.length
                    ? t("settings.relayPlan.groups.routedPartial", {
                        used: urls.length,
                        declared,
                      })
                    : plural(
                        "settings.relayPlan.groups.routedAll",
                        urls.length,
                      )}
                </span>
              </span>
            );
          }}
        />
      </Show>
      <Show when={nothing()}>
        <p class="c-secondary text-caption">
          {query().trim() === ""
            ? t("settings.relayPlan.groups.none")
            : t("settings.relayPlan.groups.notFound")}
        </p>
      </Show>
    </>
  );
};

const PersonGroup: Component<{
  title: string;
  pubkeys: readonly string[];
  warn?: boolean;
  /** 全員に同じことが言えるときは、行ごとに繰り返さずここに書く。 */
  note?: string;
  detail?: (pubkey: string) => JSX.Element;
}> = (props) => (
  <Collapsible.Root lazyMount unmountOnExit defaultOpen>
    <Collapsible.Trigger class="group flex w-full items-center gap-1.5 bg-transparent p-0 py-1 text-left enabled:cursor-pointer">
      <Show when={props.warn}>
        <span
          class="i-material-symbols:warning-outline-rounded c-status-warn size-4 shrink-0"
          aria-hidden="true"
        />
      </Show>
      <span class="c-secondary font-600 text-caption">{props.title}</span>
      <span class="c-secondary text-caption">
        {plural("settings.relayPlan.people", props.pubkeys.length)}
      </span>
      <span
        class="i-material-symbols:expand-more-rounded c-secondary size-4.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </Collapsible.Trigger>
    <Collapsible.Content class="motion-collapse">
      <Show when={props.note}>
        {(note) => <p class="c-secondary pb-1 text-caption">{note()}</p>}
      </Show>
      <div class="rounded-2 border border-primary px-3 py-1">
        <PeopleList pubkeys={props.pubkeys} detail={props.detail} />
      </div>
    </Collapsible.Content>
  </Collapsible.Root>
);

export default RelayPlanView;
