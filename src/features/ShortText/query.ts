import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { kinds } from "nostr-tools";
import { createRxBackwardReq, latest, now, tie, uniq } from "rx-nostr";
import { filter, map } from "rxjs";
import { createEffect, from } from "solid-js";
import { useRxNostr } from "../../context/rxNostr";
import { fetchOEmbed } from "../../libs/fetchOEmbed";
import { fetchOgp } from "../../libs/fetchOgp";
import { signal2observable, toArrayScan } from "../../libs/rxjs";
import {
  parseFollowList,
  parseReaction,
  parseRepost,
  parseShortTextNote,
} from "./event";

// TODO: filter/search
// TODO: authorsではなくfilterを指定させる?

export const useQueryShortTextById = (id: () => string | undefined) => {
  const targetId$ = signal2observable(id);

  const rxNostr = useRxNostr();
  const rxReq = createRxBackwardReq();

  targetId$
    .pipe(filter((v): v is Exclude<typeof v, undefined> => !!v))
    .subscribe((targetId) => {
      rxReq.emit({
        kinds: [kinds.ShortTextNote],
        ids: [targetId],
      });
      rxReq.over();
    });

  return from(
    rxNostr.use(rxReq).pipe(
      latest(),
      map((e) => parseShortTextNote(e.event)),
    ),
  );
};

export const useQueryFollowList = (pubkey: () => string | undefined) => {
  const pubkey$ = signal2observable(pubkey);

  const rxNostr = useRxNostr();
  const rxReq = createRxBackwardReq();

  pubkey$
    .pipe(filter((v): v is Exclude<typeof v, undefined> => !!v))
    .subscribe((pubkey) => {
      rxReq.emit({
        kinds: [kinds.Contacts],
        authors: [pubkey],
      });
      rxReq.over();
    });

  return from(
    rxNostr.use(rxReq).pipe(
      latest(),
      map((e) => parseFollowList(e.event).followees.map((f) => f.pubkey)),
    ),
  );
};

export const useQueryReactions = (targetEventId: () => string | undefined) => {
  // const targetEventId$ = signal2observable(targetEventId);

  // const rxNostr = useRxNostr();
  // const rxReq = createRxBackwardReq();

  // targetEventId$
  //   .pipe(filter((v): v is Exclude<typeof v, undefined> => !!v))
  //   .subscribe((targetEventId) => {
  //     rxReq.emit({
  //       kinds: [kinds.Reaction],
  //       "#e": [targetEventId],
  //     });
  //     rxReq.over();
  //   });

  // return from(
  //   rxNostr.use(rxReq).pipe(
  //     tie(),
  //     map((e) => parseReaction(e.event)),
  //     scan(
  //       (acc, cur) => acc.concat(cur),
  //       [] as ReturnType<typeof parseReaction>[],
  //     ),
  //   ),
  // );

  type Res = ReturnType<typeof parseReaction>[];

  const queryClient = useQueryClient();

  const rxNostr = useRxNostr();
  const rxReq = createRxBackwardReq();
  const queryKey = () => ["reactions", { targetEventId: targetEventId() }];

  const queryRes = createQuery(() => ({
    queryKey: queryKey(),
    queryFn: () => {
      return new Promise<Res | null>((resolve) => {
        let latestData: Res | null = null;
        rxNostr
          .use(rxReq)
          .pipe(
            uniq(),
            map((e) => parseReaction(e.event)),
            toArrayScan(),
          )
          .subscribe({
            next: (e) => {
              latestData = e;
              queryClient.setQueryData(queryKey(), e);
            },
            complete: () => {
              resolve(latestData);
            },
          });
      });
    },
    enabled: !!targetEventId(),
  }));

  createEffect(() => {
    if (queryRes.isStale) {
      const _target = targetEventId();
      if (!_target) return;
      rxReq.emit({
        kinds: [kinds.Reaction],
        "#e": [_target],
        until: now(),
      });
      rxReq.over();
    }
  });

  return queryRes;
};

export const useQueryReposts = (targetEventId: () => string | undefined) => {
  const targetEventId$ = signal2observable(targetEventId);

  const rxNostr = useRxNostr();
  const rxReq = createRxBackwardReq();

  targetEventId$
    .pipe(filter((v): v is Exclude<typeof v, undefined> => !!v))
    .subscribe((targetEventId) => {
      rxReq.emit({
        kinds: [kinds.Repost],
        "#e": [targetEventId],
      });
      rxReq.over();
    });

  return from(
    rxNostr.use(rxReq).pipe(
      tie(),
      map((e) => parseRepost(e.event)),
      toArrayScan(),
    ),
  );
};

export const useQueryEmbed = (url: () => string | undefined) => {
  return createQuery(() => ({
    queryKey: ["embed", url()],
    queryFn: async () => {
      const oEmbed = await fetchOEmbed(url() ?? "");
      if (oEmbed)
        return {
          type: "oEmbed" as const,
          value: oEmbed,
        };

      const ogp = await fetchOgp(url() ?? "");
      if (ogp)
        return {
          type: "ogp" as const,
          value: ogp,
        };

      // const ogpWithoutProxy = await fetchOgp(url() ?? "", false);
      // if (ogpWithoutProxy)
      //   return {
      //     type: "ogp" as const,
      //     value: ogpWithoutProxy,
      //   };
      return null;
    },
    enabled: !!url(),
  }));
};
