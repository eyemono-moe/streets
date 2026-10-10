import { EnvironmentProvider } from "@ark-ui/solid/environment";
import { type ParentComponent, createContext, useContext } from "solid-js";
import { DelegatedEvents, delegateEvents } from "solid-js/web";

const AppWindowContext = createContext<Window>();

/**
 * いま描いている窓。カラムをピクチャーインピクチャー（Document Picture-in-Picture）へ出すと、
 * その中の部品は元のタブと同じ JS の場で動くまま、別の document に描かれる。
 * 文書に結びつくもの（Portal の出し先・クリップボード）はグローバルの
 * `window` / `document` ではなくここから取る。
 */
export const useAppWindow = (): Window =>
  useContext(AppWindowContext) ?? window;

/** 子を別の窓に描く。窓は作るときに決まり、差し替えない。 */
export const AppWindowProvider: ParentComponent<{ window: Window }> = (
  props,
) => {
  const win = props.window;
  // Solid は onClick などを元の document でまとめて受ける。別の document には
  // 受け口を足さないと、押しても何も起きない。同じ document へは二重に足されない。
  delegateEvents([...DelegatedEvents], win.document);
  return (
    <AppWindowContext.Provider value={win}>
      <EnvironmentProvider value={() => win.document}>
        {props.children}
      </EnvironmentProvider>
    </AppWindowContext.Provider>
  );
};
