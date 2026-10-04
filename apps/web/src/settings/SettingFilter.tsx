import {
  type Accessor,
  type ParentComponent,
  createContext,
  useContext,
} from "solid-js";
import type { SettingId } from "./setting-registry";

const SettingFilterContext = createContext<Accessor<SettingId>>();

/** 検索結果で元の設定ページを描くとき、一項目だけを表示する。 */
export const SettingFilter: ParentComponent<{ id: SettingId }> = (props) => (
  <SettingFilterContext.Provider value={() => props.id}>
    {props.children}
  </SettingFilterContext.Provider>
);

export const useSettingFilter = (): Accessor<SettingId> | undefined =>
  useContext(SettingFilterContext);
