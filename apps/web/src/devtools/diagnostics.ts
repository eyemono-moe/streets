import type { WarmUpResult } from "@streets/core/read/bootstrap";
import type { SectionStatus } from "@streets/core/read/source";
import { createStore } from "solid-js/store";

export type Diagnostics = {
  pubkey?: string;
  warmUp?: WarmUpResult & { totalMs: number };
  sections: Record<string, SectionStatus & { items: number }>;
};

// 画面は値を書き込むだけにして、表示は devtools のパネルに任せる。
export const [diagnostics, setDiagnostics] = createStore<Diagnostics>({
  sections: {},
});
