import { createSignal, onCleanup } from "solid-js";
import {
  type NostrCore,
  type NostrCoreConnectionStateMap,
  useNostrCore,
} from "./provider";

export const useCoreConnectionState = (core?: NostrCore) => {
  const currentCore = core ?? useNostrCore();
  const [connectionState, setConnectionState] =
    createSignal<NostrCoreConnectionStateMap>(
      currentCore.connectionState.getSnapshot(),
    );

  const subscription = currentCore.connectionState.observe().subscribe({
    next(snapshot) {
      setConnectionState(snapshot);
    },
  });

  onCleanup(() => {
    subscription.unsubscribe();
  });

  return connectionState;
};
