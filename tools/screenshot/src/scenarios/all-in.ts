import type { AppScenario } from "../scenario";
import type { UserId } from "../users";

/** 共通 fixture を各シナリオが含むので、同じ定義は 1 回だけ投入する。 */
const unique = <T>(items: readonly T[]): T[] => [
  ...new Map(items.map((item) => [JSON.stringify(item), item])).values(),
];

/** 人ごとの id の並び（ピン留め・絵文字リスト）を、重複を除いてつなぐ。 */
const mergeLists = (
  lists: readonly (Partial<Record<UserId, readonly string[]>> | undefined)[],
): Partial<Record<UserId, string[]>> => {
  const merged: Partial<Record<UserId, string[]>> = {};
  for (const list of lists) {
    for (const [person, ids] of Object.entries(list ?? {}) as [
      UserId,
      readonly string[],
    ][]) {
      merged[person] = [...new Set([...(merged[person] ?? []), ...ids])];
    }
  }
  return merged;
};

/** 個別シナリオのデータをすべて使える撮影環境。カラムも重複を除いて並べる。 */
export const allInScenario = (
  scenarios: readonly AppScenario[],
): AppScenario => {
  const viewer = scenarios[0]?.viewer;
  if (!viewer || scenarios.some((scenario) => scenario.viewer !== viewer)) {
    throw new Error("all-in のシナリオは、見る人をそろえてください");
  }

  const follows: Partial<Record<UserId, UserId[]>> = {};
  for (const scenario of scenarios) {
    for (const [person, followees] of Object.entries(scenario.follows) as [
      UserId,
      readonly UserId[],
    ][]) {
      follows[person] = [
        ...new Set([...(follows[person] ?? []), ...followees]),
      ];
    }
  }

  return {
    description:
      "全シナリオの投稿・通知・画像・チャンネル・リスト・追加した kind をまとめて使う",
    viewer,
    follows,
    posts: unique(scenarios.flatMap((scenario) => scenario.posts)),
    reactions: unique(
      scenarios.flatMap((scenario) => scenario.reactions ?? []),
    ),
    reposts: unique(scenarios.flatMap((scenario) => scenario.reposts ?? [])),
    zaps: unique(scenarios.flatMap((scenario) => scenario.zaps ?? [])),
    channels: unique(scenarios.flatMap((scenario) => scenario.channels ?? [])),
    favoriteChannels: unique(
      scenarios.flatMap((scenario) => scenario.favoriteChannels ?? []),
    ),
    followSets: unique(
      scenarios.flatMap((scenario) => scenario.followSets ?? []),
    ),
    mediaPosts: unique(
      scenarios.flatMap((scenario) => scenario.mediaPosts ?? []),
    ),
    polls: unique(scenarios.flatMap((scenario) => scenario.polls ?? [])),
    articles: unique(scenarios.flatMap((scenario) => scenario.articles ?? [])),
    emojiSets: unique(
      scenarios.flatMap((scenario) => scenario.emojiSets ?? []),
    ),
    emojiLists: mergeLists(scenarios.map((scenario) => scenario.emojiLists)),
    statuses: unique(scenarios.flatMap((scenario) => scenario.statuses ?? [])),
    pinned: mergeLists(scenarios.map((scenario) => scenario.pinned)),
    deck: unique(scenarios.flatMap((scenario) => scenario.deck ?? [])),
  };
};
