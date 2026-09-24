import {
  type Nip05Address,
  type Nip05Lookup,
  fetchNip05,
} from "@streets/core/nostr/nip05";
import { createQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";

const DAY_MS = 24 * 60 * 60 * 1000;
// 聞けなかった答えは早めに取り直す。ドメイン側で直したのが 1 日伝わらないと困る。
const UNREACHABLE_STALE_MS = 5 * 60 * 1000;

export const nip05QueryKey = (address: Nip05Address | undefined) =>
  ["nip05", address?.name, address?.domain] as const;

/**
 * ドメインに NIP-05 の答えを聞く。同じ宛先への問い合わせは画面全体で 1 回に
 * まとめ、確かめられた答えは 1 日取り直さない。聞けなかったことも答えとして持つ
 * ので、失敗しても繰り返し聞きには行かない。
 */
export const useNip05Lookup = (address: Accessor<Nip05Address | undefined>) =>
  createQuery(() => {
    const target = address();
    return {
      queryKey: nip05QueryKey(target),
      queryFn: (): Promise<Nip05Lookup> =>
        target ? fetchNip05(target) : Promise.resolve({ kind: "unreachable" }),
      enabled: target !== undefined,
      retry: false,
      staleTime: (query) =>
        query.state.data?.kind === "unreachable"
          ? UNREACHABLE_STALE_MS
          : DAY_MS,
    };
  });
