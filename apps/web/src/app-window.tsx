import { createContext, useContext } from "solid-js";

const AppWindowContext = createContext<Window>();

/**
 * いま描いている窓。カラムをピクチャーインピクチャー（Document Picture-in-Picture）へ出すと、
 * その中の部品は元のタブと同じ JS の場で動くまま、別の document に描かれる。
 * 文書に結びつくもの（Portal の出し先・クリップボード）はグローバルの
 * `window` / `document` ではなくここから取る。
 */
export const useAppWindow = (): Window =>
  useContext(AppWindowContext) ?? window;
