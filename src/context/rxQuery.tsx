import { type QueryKey, useQueryClient } from "@tanstack/solid-query";
import { type Filter, kinds } from "nostr-tools";
import {
  batch,
  createRxBackwardReq,
  filterByKinds,
  latest,
  latestEach,
  uniq,
} from "rx-nostr";
import { bufferWhen, interval, share } from "rxjs";
import { type ParentComponent, createContext, useContext } from "solid-js";
import { mergeSimilarAndRemoveEmptyFilters } from "../libs/mergeFilters";
import { parseEventPacket } from "../libs/parser";
import { useRxNostr } from "./rxNostr";

const RxQueryContext = createContext<{
  actions: {
    emit: (filter: Filter) => void;
  };
}>();

export const RxQueryProvider: ParentComponent = (props) => {
  const rxNostr = useRxNostr();
  const rxBackwardReq = createRxBackwardReq();
  const queryClient = useQueryClient();
  // すべてのbackwardReq由来のイベント
  const backwardEvent$ = rxNostr
    .use(
      rxBackwardReq.pipe(
        bufferWhen(() => interval(1000)),
        batch((a, b) => mergeSimilarAndRemoveEmptyFilters([...a, ...b])),
      ),
    )
    .pipe(uniq(), share());

  // pubkeyごとに最新のイベントをフィルター
  const latestByPubkey$ = backwardEvent$.pipe(
    latestEach((e) => e.event.pubkey),
    share(),
  );

  // 最新1件を取得/保存するkind
  latestByPubkey$
    .pipe(filterByKinds([kinds.Metadata, kinds.Contacts, kinds.RelayList]))
    .subscribe({
      // 最新1件のみをcacheに保存する
      next: (e) => {
        // TODO: gen queryKey automatically
        queryClient.prefetchQuery({
          queryKey: [e.event.kind, e.event.pubkey],
          queryFn: () => {
            return parseEventPacket(e);
          },
        });
      },
    });

  // IDごとに最新のイベントをフィルター
  const latestByID$ = backwardEvent$.pipe(latest(), share());

  // 最新1件を取得できれば良いkindのイベント
  latestByID$.pipe(filterByKinds([kinds.ShortTextNote])).subscribe({
    // 最新1件のみをcacheに保存する
    next: (e) => {
      // TODO: gen queryKey automatically
      queryClient.prefetchQuery({
        queryKey: [e.event.kind, e.event.id],
        queryFn: () => {
          return parseEventPacket(e);
        },
      });
    },
  });

  // 過去全件を取得するkindのイベント
  latestByID$.pipe(filterByKinds([kinds.Repost, kinds.Reaction])).subscribe({
    next: (e) => {
      const parsed = parseEventPacket(e);
      // TODO: gen queryKey automatically
      let queryKeys: QueryKey[];
      // TODO: 関数に切り出し, 各イベントのkindについてtestする
      switch (parsed.parsed.kind) {
        case kinds.Repost:
          queryKeys = parsed.parsed.tags
            .filter((tag) => tag.kind === "e")
            .map((tag) => ["repostsOf", tag.id]);
          break;
        case kinds.Reaction:
          queryKeys = [
            ["reactionsOf", parsed.parsed.targetEvent.id],
            ["reactionsBy", parsed.raw.pubkey],
          ];
          break;
        default:
          throw new Error(`unknown kind: ${parsed.parsed.kind}`);
      }

      for (const queryKey of queryKeys) {
        queryClient.prefetchQuery({
          queryKey,
          queryFn: () => {
            const prev = queryClient.getQueryData<
              ReturnType<typeof parseEventPacket>[] | undefined
            >(queryKeys);
            if (prev) {
              // TODO: sort?
              return [...prev, parsed];
            }
            return [parsed];
          },
        });
      }
    },
  });

  const emit = (filter: Filter) => {
    rxBackwardReq.emit(filter);
  };

  return (
    <RxQueryContext.Provider
      value={{
        actions: {
          emit,
        },
      }}
    >
      {props.children}
    </RxQueryContext.Provider>
  );
};

export const useRxQuery = () => {
  const ctx = useContext(RxQueryContext);
  if (!ctx) {
    throw new Error("useRxQuery must be used within a RxQueryProvider");
  }

  return ctx;
};
