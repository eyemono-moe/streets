import { kinds } from "nostr-tools";
import {
  type RxReqEmittable,
  batch,
  createRxBackwardReq,
  filterByKinds,
  latestEach,
} from "rx-nostr";
import { bufferWhen, interval, share } from "rxjs";
import { type ParentComponent, createContext, useContext } from "solid-js";
import { mergeSimilarAndRemoveEmptyFilters } from "../libs/mergeFilters";
import { cacheAndEmitRelatedEvent } from "../libs/rxQuery";
import { eventCacheSetter } from "./eventCache";
import { useRxNostr } from "./rxNostr";

const RxQueryContext = createContext<{
  actions: {
    emit: RxReqEmittable<{ relays: string[] }>["emit"];
  };
}>();

export const RxQueryProvider: ParentComponent = (props) => {
  const rxNostr = useRxNostr();
  const rxBackwardReq = createRxBackwardReq();
  const emit = rxBackwardReq.emit;
  const setter = eventCacheSetter();

  // すべてのbackwardReq由来のイベント
  const backwardEvent$ = rxNostr
    .use(
      rxBackwardReq.pipe(
        bufferWhen(() => interval(1000)),
        batch((a, b) => mergeSimilarAndRemoveEmptyFilters([...a, ...b])),
      ),
    )
    .pipe(share());

  // pubkeyごとの最新イベントが必要なkind
  backwardEvent$
    .pipe(
      // TODO: 対応するkindを定数で持つ
      filterByKinds([kinds.Metadata, kinds.Contacts, kinds.RelayList]),
      latestEach((e) => e.event.pubkey),
      share(),
    )
    .subscribe({
      next: (e) => {
        cacheAndEmitRelatedEvent(e, emit, setter);
      },
    });

  // IDごとの最新イベントが必要なkind
  backwardEvent$
    .pipe(
      // TODO: 対応するkindを定数で持つ
      filterByKinds([kinds.ShortTextNote, kinds.Repost, kinds.Reaction]),
      latestEach((e) => e.event.id),
      share(),
    )
    .subscribe({
      next: (e) => {
        cacheAndEmitRelatedEvent(e, emit, setter);
      },
    });

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
