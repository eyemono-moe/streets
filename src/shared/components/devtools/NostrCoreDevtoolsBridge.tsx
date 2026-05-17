import { onCleanup } from "solid-js";
import type { NostrCore } from "../../../core/solid/provider";
import {
  type NostrCoreDevtoolsSnapshot,
  nostrCoreDevtoolsClient,
} from "./nostr-core-devtools-client";

const createSnapshot = (core: NostrCore): NostrCoreDevtoolsSnapshot => ({
  eventStore: core.eventStore.getSnapshot(),
  feeds: core.feedStateStore.listSnapshots(),
  queryRegistry: core.queryRegistry.getSnapshot(),
  connectionState: core.connectionState.getSnapshot(),
  updatedAt: Date.now(),
});

const NostrCoreDevtoolsBridge = (props: { core: NostrCore }) => {
  const emitSnapshot = () => {
    nostrCoreDevtoolsClient.emit(
      "snapshot-changed",
      createSnapshot(props.core),
    );
  };

  emitSnapshot();

  const cleanupEventStore = props.core.eventStore.subscribe(emitSnapshot);
  const cleanupFeedState = props.core.feedStateStore.subscribeAll(emitSnapshot);
  const cleanupQueryRegistry = props.core.queryRegistry.subscribe(emitSnapshot);
  const connectionStateSubscription = props.core.connectionState
    .observe()
    .subscribe({ next: emitSnapshot });
  const cleanupRequests = nostrCoreDevtoolsClient.on(
    "request-snapshot",
    emitSnapshot,
  );

  onCleanup(() => {
    cleanupEventStore();
    cleanupFeedState();
    cleanupQueryRegistry();
    connectionStateSubscription.unsubscribe();
    cleanupRequests();
  });

  return null;
};

export default NostrCoreDevtoolsBridge;
