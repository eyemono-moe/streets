import { type ParentComponent, createContext, useContext } from "solid-js";

export type ColumnNavigation = {
  openUser(pubkey: string): void;
  openFollowees(pubkey: string): void;
  openFollowers(pubkey: string): void;
};

const ColumnNavigationContext = createContext<ColumnNavigation>();

export const ColumnNavigationProvider: ParentComponent<{
  value: ColumnNavigation;
}> = (props) => (
  <ColumnNavigationContext.Provider value={props.value}>
    {props.children}
  </ColumnNavigationContext.Provider>
);

export const useColumnNavigation = (): ColumnNavigation => {
  const navigation = useContext(ColumnNavigationContext);
  if (!navigation) {
    throw new Error("ColumnNavigationProvider の内側で使用してください");
  }
  return navigation;
};

export const useOptionalColumnNavigation = (): ColumnNavigation | undefined =>
  useContext(ColumnNavigationContext);
