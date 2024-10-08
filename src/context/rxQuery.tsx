import {
  type RxReqEmittable,
  batch,
  createRxBackwardReq,
  latestEach,
} from "rx-nostr";
import { bufferWhen, interval } from "rxjs";
import { type ParentComponent, createContext, useContext } from "solid-js";
import { mergeSimilarAndRemoveEmptyFilters } from "../libs/mergeFilters";
import { cacheAndEmitRelatedEvent } from "../libs/rxQuery";
import { eventCacheSetter } from "./eventCache";
import { useRxNostr } from "./rxNostr";

const RxQueryContext = createContext<{
  rxBackwardReq: ReturnType<typeof createRxBackwardReq>;
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
  rxNostr
    .use(
      rxBackwardReq.pipe(
        bufferWhen(() => interval(1000)),
        batch((a, b) => mergeSimilarAndRemoveEmptyFilters([...a, ...b])),
      ),
    )
    .pipe(latestEach((e) => e.event.id))
    .subscribe({
      next: (e) => {
        cacheAndEmitRelatedEvent(e, emit, setter);
      },
    });

  return (
    <RxQueryContext.Provider
      value={{
        rxBackwardReq,
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
