import type { RelayTraffic } from "@streets/core/relay/relay-traffic";
import { type ParentComponent, createContext, useContext } from "solid-js";

const RelayTrafficContext = createContext<RelayTraffic>();

export const RelayTrafficProvider: ParentComponent<{ value: RelayTraffic }> = (
  props,
) => (
  <RelayTrafficContext.Provider value={props.value}>
    {props.children}
  </RelayTrafficContext.Provider>
);

/** リレーとのやりとりの数え。数えていない場所（Storybook など）では undefined。 */
export const useRelayTraffic = (): RelayTraffic | undefined =>
  useContext(RelayTrafficContext);
