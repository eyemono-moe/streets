import { type Nip05Lookup, parseNip05 } from "@streets/core/nostr/nip05";
import { useQueryClient } from "@tanstack/solid-query";
import { nip05QueryKey } from "../profile/nip05";

/**
 * NIP-05 の答えを先に入れておく。ストーリーからドメインへは聞きに行かない。
 * 答えはストーリーをまたいで残るので、答えの違うものは別のドメインで書く。
 */
export const useStoryNip05 = (answers: Record<string, Nip05Lookup>) => {
  const queryClient = useQueryClient();
  for (const [text, answer] of Object.entries(answers)) {
    const address = parseNip05(text);
    if (!address) throw new Error(`NIP-05 として読めません: ${text}`);
    queryClient.setQueryData(nip05QueryKey(address), answer);
  }
};
