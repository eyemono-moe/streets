import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { kinds } from "nostr-tools";
import { createRxBackwardReq, latest } from "rx-nostr";
import { createEffect } from "solid-js";
import { useRxNostr } from "../../context/rxNostr";
import { parseProfile } from "./event";

export const useQueryProfile = (pubkey: () => string | undefined) => {
  // const pubkey$ = signal2observable(pubkey);

  // const rxNostr = useRxNostr();
  // const rxReq = createRxBackwardReq();

  // pubkey$
  //   .pipe(filter((v): v is Exclude<typeof v, undefined> => !!v))
  //   .subscribe((pubkey) => {
  //     rxReq.emit({
  //       kinds: [kinds.Metadata],
  //       authors: [pubkey],
  //       limit: 1,
  //     });
  //     rxReq.over();
  //   });

  // return from(
  //   rxNostr.use(rxReq).pipe(
  //     latest(),
  //     map((e) => parseProfile(e.event)),
  //   ),
  // );

  type Res = ReturnType<typeof parseProfile>;

  const queryClient = useQueryClient();

  const rxNostr = useRxNostr();
  const rxReq = createRxBackwardReq();
  const queryKey = () => ["profile", pubkey()];

  const queryRes = createQuery(() => ({
    queryKey: queryKey(),
    queryFn: () => {
      return new Promise<Res | null>((resolve) => {
        let latestData: Res | null = null;
        rxNostr
          .use(rxReq)
          .pipe(latest())
          .subscribe({
            next: (e) => {
              latestData = parseProfile(e.event);
              queryClient.setQueryData(queryKey(), latestData);
            },
            complete: () => {
              resolve(latestData);
            },
          });
      });
    },
    enabled: !!pubkey(),
  }));

  createEffect(() => {
    if (queryRes.isStale) {
      const _pubkey = pubkey();
      if (!_pubkey) return;
      rxReq.emit({
        kinds: [kinds.Metadata],
        authors: [_pubkey],
        limit: 1,
      });
      rxReq.over();
    }
  });

  return queryRes;
};
