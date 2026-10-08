import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { planQuery } from "./query-plan";
import {
  type ReadPlan,
  type SectionPlanInput,
  summarizeReadPlan,
} from "./read-plan";
import type { ReadRouting } from "./read-routing";
import { selectRelays } from "./relay-selector";

export type ReadRequest = {
  readonly id: number;
  readonly filters: readonly RelayFilter[];
  /** `undefined` は Outbox に任せる。配列（空を含む）は選択を通さずそのリレーだけを読む。 */
  readonly explicitRelays: readonly RelayUrl[] | undefined;
  /** Outbox の行き先に加えて、全フィルタを送るリレー。`explicitRelays` があるときは使わない。 */
  readonly extraRelays: readonly RelayUrl[];
};

export type ReadEnvironment = {
  routing: ReadRouting;
  /** 著者で行き先を決められない読み取りの送り先。`direct` ではそのリレーだけ。 */
  defaultRelays: readonly RelayUrl[];
  writeRelaysFor: (author: string) => readonly RelayUrl[];
  budget: number;
  redundancy: number;
  /** いま開いているリレー。同点のときに優先して張り直しを減らす。 */
  openRelays: readonly RelayUrl[];
  degraded: readonly RelayUrl[];
  blocked: readonly RelayUrl[];
  /** `blocked` の配列では足りない。許していないローカルネットワークのリレーは、配列に入らない。 */
  isBlocked: (url: RelayUrl) => boolean;
  isLocalRefused: (url: RelayUrl) => boolean;
};

export type RequestRoute = {
  readonly perRelay: Map<RelayUrl, RelayFilter[]>;
  /** 行き先が分からず既定のリレーへ回した著者。`direct` では欠落として数えない。 */
  readonly unroutableAuthors: readonly string[];
  /** 接続予算か degraded / blocked で、どのリレーにも割り当てられなかった著者。 */
  readonly uncoveredAuthors: readonly string[];
};

export type ReadPlanResult = {
  /** `requests` と同じ順。 */
  readonly routes: readonly RequestRoute[];
  /** 著者 → 割り当てたリレー（優先順）。行き先の分かる著者だけ入る。 */
  readonly assignment: ReadonlyMap<string, readonly RelayUrl[]>;
  readonly readPlan: ReadPlan;
};

export const planReads = (
  requests: readonly ReadRequest[],
  env: ReadEnvironment,
): ReadPlanResult => {
  const direct = env.routing.mode === "direct";
  // 待つリレーの母集合からも外す。開けないリレーを待つと、完了しないまま残る。
  const fallbackRelays = env.defaultRelays.filter((url) => !env.isBlocked(url));

  // direct では需要を作らない。全著者が `fallbackRelays`（= direct のリレー）へ行く。
  const demand = new Map<string, readonly RelayUrl[]>();
  const seenAuthors = new Set<string>();
  for (const request of requests) {
    if (direct) break;
    if (request.explicitRelays !== undefined) continue;
    for (const filter of request.filters) {
      for (const author of filter.authors ?? []) {
        if (seenAuthors.has(author)) continue;
        seenAuthors.add(author);
        // 他人の localhost は数えない。それしか無い著者は、行き先の分からない著者として扱う。
        const declared = env
          .writeRelaysFor(author)
          .filter((url) => !env.isLocalRefused(url));
        if (declared.length > 0) demand.set(author, declared);
      }
    }
  }

  // 明示指定を先に確保してから既定のリレーを足す。予算が小さいとき、
  // 既定のリレーが明示指定を押し出さないため。
  const pinnedSet = new Set<RelayUrl>();
  for (const request of requests) {
    for (const url of request.explicitRelays ?? request.extraRelays) {
      pinnedSet.add(url);
    }
  }
  for (const url of fallbackRelays) pinnedSet.add(url);
  const pinned = [...pinnedSet];

  const selection = selectRelays({
    demand,
    pinned,
    current: env.openRelays,
    budget: env.budget,
    redundancy: env.redundancy,
    degraded: env.degraded,
    preferred:
      env.routing.mode === "outbox" ? env.routing.preferred : undefined,
    blocked: [
      ...env.blocked,
      ...pinned.filter((url) => env.isLocalRefused(url)),
    ],
  });

  const routes = requests.map((request) =>
    routeRequest(request, selection.assignment, {
      fallbackRelays,
      direct,
      isBlocked: env.isBlocked,
    }),
  );
  const sections: SectionPlanInput[] = routes.map((route, index) => ({
    explicit: requests[index].explicitRelays !== undefined,
    perRelay: route.perRelay,
    unroutableAuthors: route.unroutableAuthors,
    uncoveredAuthors: route.uncoveredAuthors,
  }));

  return {
    routes,
    assignment: selection.assignment,
    readPlan: summarizeReadPlan({
      mode: env.routing.mode,
      fallbackRelays,
      sections,
    }),
  };
};

const routeRequest = (
  request: ReadRequest,
  assignment: ReadonlyMap<string, readonly RelayUrl[]>,
  context: {
    fallbackRelays: readonly RelayUrl[];
    direct: boolean;
    isBlocked: (url: RelayUrl) => boolean;
  },
): RequestRoute => {
  const filters = [...request.filters];
  if (request.explicitRelays !== undefined) {
    // 明示リレーは選択を経由しない。名指ししたリレーを予算都合で落とさないため。
    const perRelay = new Map<RelayUrl, RelayFilter[]>();
    for (const url of request.explicitRelays) {
      if (context.isBlocked(url)) continue;
      // 配列を共有すると一方への変更が他方に漏れるので、リレーごとに分ける。
      perRelay.set(url, [...filters]);
    }
    return {
      perRelay,
      unroutableAuthors: [],
      uncoveredAuthors: [],
    };
  }

  const own = new Map<string, readonly RelayUrl[]>();
  for (const filter of filters) {
    for (const author of filter.authors ?? []) {
      if (own.has(author)) continue;
      // 需要に無い著者は assignment にも無く、planQuery が行き先の分からない著者に回す。
      const assigned = assignment.get(author);
      if (assigned !== undefined) own.set(author, assigned);
    }
  }
  const plan = planQuery({
    filters,
    assignment: own,
    fallbackRelays: context.fallbackRelays,
  });
  // 足したリレーには、著者で分けずにフィルタをそのまま送る。そこにあると
  // 分かっているものを、Outbox の割り当てに関係なく取るため。
  for (const url of request.extraRelays) {
    if (context.isBlocked(url)) continue;
    plan.perRelay.set(url, [...filters]);
  }
  return {
    perRelay: plan.perRelay,
    // direct では既定のリレー行きが本来の行き先なので、欠落として数えない。
    unroutableAuthors: context.direct ? [] : plan.unroutableAuthors,
    uncoveredAuthors: plan.uncoveredAuthors,
  };
};
