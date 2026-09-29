import inventory from "./kind-support.json";

export type KindSupport = {
  kind: number;
  status: "表示対応" | "内部利用" | "未対応";
  summary: string;
};

/** Event での表示対応と、画面に出さない内部利用を区別する。 */
export const KIND_SUPPORT: KindSupport[] = inventory as KindSupport[];
