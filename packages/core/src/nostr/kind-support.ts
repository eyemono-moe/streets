import inventory from "./kind-support.json";

export type KindSupport = {
  kind: number;
  status: "表示対応" | "内部利用" | "未対応";
  summary: string;
};

/** Event での表示対応と、画面に出さない内部利用を区別する。 */
export const KIND_SUPPORT: KindSupport[] = inventory as KindSupport[];

/**
 * 「○○さんの<これ>」と呼ぶときの kind の名前。知らない kind を「投稿」と呼ぶと
 * 別物を投稿と偽るので、汎用の呼び名にする。
 */
export const kindLabel = (kind: number): string =>
  KIND_SUPPORT.find((entry) => entry.kind === kind)?.summary ?? "イベント";
