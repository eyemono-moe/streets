import type {
  RelayFailure,
  RelayFailures,
} from "@streets/core/relay/relay-failures";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  from,
  useContext,
} from "solid-js";

const RelayFailuresContext = createContext<RelayFailures>();

export const RelayFailuresProvider: ParentComponent<{
  value: RelayFailures;
}> = (props) => (
  <RelayFailuresContext.Provider value={props.value}>
    {props.children}
  </RelayFailuresContext.Provider>
);

/** このタブで繋がらなかった・断られたリレー。数えていない場所（Storybook など）では空。 */
export const useRelayFailures = (): Accessor<readonly RelayFailure[]> => {
  const failures = useContext(RelayFailuresContext);
  if (!failures) return () => [];
  const list = from<readonly RelayFailure[]>((set) => {
    set(failures.list());
    return failures.subscribe(() => set(failures.list()));
  });
  return () => list() ?? [];
};
