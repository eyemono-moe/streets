import { parseProfile, profileLabel } from "@streets/core/nostr/profile";
import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import type { ReadPlan } from "@streets/core/read/read-plan";
import { summarizeTraffic } from "@streets/core/relay/relay-traffic";
import {
  type Component,
  Show,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useReadLayer } from "../read-layer";
import { useRelayTraffic } from "../relay-traffic";
import { Mediates, type UiEvent } from "../ui-events";
import { useRelayEdit } from "./RelayMediator";
import RelayPlanView from "./RelayPlanView";
import RelayTrafficView from "./RelayTrafficView";

/**
 * 数えた値と接続の様子を見直す間隔。数えるたびに知らせると、イベントを受け取る
 * たびに画面を描き直すことになるので、このページを開いている間だけ見に行く。
 */
const POLL_MS = 2000;

/** 見るだけの統計のページ。リレーとの通信量と、いま使っているリレーを並べる。 */
const StatsSettings: Component = () => {
  const traffic = useRelayTraffic();
  const edit = useRelayEdit();
  const readLayer = useReadLayer();
  const [tick, setTick] = createSignal(0);
  const interval = setInterval(() => setTick((n) => n + 1), POLL_MS);
  onCleanup(() => clearInterval(interval));

  const read = () => {
    const elapsedMs = traffic?.elapsedMs() ?? 0;
    return {
      summary: summarizeTraffic(traffic?.snapshot() ?? []),
      elapsedMs,
      since: Date.now() - elapsedMs,
    };
  };
  // 数えるたびに丸ごと差し替えると、<For> がリレーの行を作り直し、開いていた内訳が閉じる。
  const [current, setCurrent] = createStore(read());
  createEffect(
    on(tick, () => setCurrent(reconcile(read(), { key: "url" })), {
      defer: true,
    }),
  );
  // 計画も同じ。読む人が変わるたびに行を作り直すと、開いていたリレーが閉じる。
  const [plan, setPlan] = createStore<{ value: ReadPlan | undefined }>({
    value: undefined,
  });
  createEffect(() => {
    const next = edit?.readPlan?.();
    setPlan("value", next ? reconcile(next, { key: "url" }) : undefined);
  });
  const statusOf = (url: string) => {
    tick();
    return readLayer.manager?.pool.statusOf(url) ?? "idle";
  };
  const nameOf = (pubkey: string) => {
    const event = readLayer.store.latestReplaceable(0, pubkey);
    return profileLabel(
      event ? parseProfile(event.content) : undefined,
      pubkey,
    );
  };

  const handle = (event: UiEvent): boolean => {
    if (event.type !== "stats/reset-traffic") return false;
    traffic?.reset();
    setTick((n) => n + 1);
    return true;
  };

  return (
    <Mediates handle={handle}>
      <div class="flex flex-col gap-7">
        <Show when={traffic}>
          <RelayTrafficView
            summary={current.summary}
            since={current.since}
            elapsedMs={current.elapsedMs}
            statusOf={statusOf}
          />
        </Show>
        <Show when={edit}>
          {(edit) => (
            <RelayPlanView
              plan={plan.value}
              routingSettled={edit().routingSettled?.() ?? true}
              entries={edit().entries()}
              loading={edit().loading()}
              fallback={FALLBACK_RELAYS}
              statusOf={(url) => {
                tick();
                return edit().statusOf(url);
              }}
              infoOf={edit().infoOf}
              declaredRelayCount={(pubkey) =>
                readLayer.routing?.writeRelaysFor(pubkey).length ?? 0
              }
              nameOf={nameOf}
            />
          )}
        </Show>
      </div>
    </Mediates>
  );
};

export default StatsSettings;
