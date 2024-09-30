import {
  type ParentComponent,
  Show,
  createContext,
  createResource,
  useContext,
} from "solid-js";
import { BatchSubscriber } from "../libs/batchClient";
import { usePool } from "../libs/usePool";

const SubscriberContext = createContext<BatchSubscriber>();

export const SubscriberProvider: ParentComponent = (props) => {
  const pool = () => usePool();
  const [subscriber] = createResource(async () => {
    return new BatchSubscriber(pool());
  });

  return (
    <Show when={subscriber.state === "ready"}>
      <SubscriberContext.Provider value={subscriber()}>
        {props.children}
      </SubscriberContext.Provider>
    </Show>
  );
};

export const useSubscriber = () => useContext(SubscriberContext);
