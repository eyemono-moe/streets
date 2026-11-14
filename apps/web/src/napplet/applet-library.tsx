import {
  APPLET_LIBRARY_IDENTIFIER,
  type AppletLibrary,
  appletLibraryStorageKey,
  emptyAppletLibrary,
  parseAppletLibrary,
  serializeAppletLibrary,
} from "@streets/core/napplet/library";
import {
  type CreateNip78DocumentOptions,
  type Nip78Document,
  type Nip78DocumentDefinition,
  createNip78Document,
} from "@streets/core/solid/create-nip78-document";
import { createContext, createSignal, useContext } from "solid-js";

const definition = {
  identifier: APPLET_LIBRARY_IDENTIFIER,
  cacheKey: appletLibraryStorageKey,
  initial: () => emptyAppletLibrary(),
  serialize: serializeAppletLibrary,
  parse: parseAppletLibrary,
  equals: (left, right) =>
    serializeAppletLibrary(left) === serializeAppletLibrary(right),
} satisfies Nip78DocumentDefinition<AppletLibrary>;

export type AppletLibraryStore = Nip78Document<AppletLibrary>;

export const createAppletLibraryStore = (
  options: Omit<CreateNip78DocumentOptions<AppletLibrary>, "definition">,
): AppletLibraryStore => createNip78Document({ ...options, definition });

const GUEST_KEY = "streets.v1.applets.guest";

/** ログインしていない人の分。アカウントが無いので、この端末にだけ置く。 */
export const createGuestAppletLibraryStore = (
  storage: Storage,
): AppletLibraryStore => {
  const load = (): AppletLibrary => {
    try {
      const raw = storage.getItem(GUEST_KEY);
      return (
        (raw === null ? undefined : parseAppletLibrary(raw)) ??
        emptyAppletLibrary()
      );
    } catch {
      return emptyAppletLibrary();
    }
  };
  const [value, setValue] = createSignal(load());
  return {
    value,
    state: () => ({ phase: "ready", sync: "local-only" }),
    update: (change) => {
      const next = change(value());
      setValue(next);
      try {
        storage.setItem(GUEST_KEY, serializeAppletLibrary(next));
      } catch {
        // 覚えられなくても、今の画面には当てる。
      }
    },
    refresh: async () => {},
    keepLocal: async () => {},
    useRemote: () => {},
  };
};

const AppletLibraryContext = createContext<() => AppletLibrary | undefined>(
  () => undefined,
);

export const AppletLibraryProvider = AppletLibraryContext.Provider;

/** インストールしたアップレットと開く先の既定。読み込むまでは undefined。 */
export const useAppletLibrary = (): (() => AppletLibrary | undefined) =>
  useContext(AppletLibraryContext);
