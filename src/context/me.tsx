import {
  type ParentComponent,
  createContext,
  createResource,
  useContext,
} from "solid-js";
import { useNIP07 } from "../shared/libs/useNIP07";

type MeState = {
  myPubkey: () => string | undefined;
  isLogged: () => boolean;
};

const MeContext = createContext<[state: MeState]>([
  {
    myPubkey: () => undefined,
    isLogged: () => false,
  },
]);

export const MeProvider: ParentComponent = (props) => {
  const [myPubkey, { refetch }] = createResource(async () => {
    try {
      const p = await useNIP07().getPublicKey();
      return p;
    } catch (e) {
      console.error(e);
      return;
    }
  });

  // nostr loginでのログイン/ログアウトが発生した際にpubkeyを再取得する
  document.addEventListener("nlAuth", () => {
    refetch();
  });

  const isLogged = () => myPubkey() !== undefined;

  return (
    <MeContext.Provider
      value={[
        {
          myPubkey,
          isLogged,
        },
      ]}
    >
      {props.children}
    </MeContext.Provider>
  );
};

export const useMe = () => {
  const ctx = useContext(MeContext);
  if (!ctx) {
    throw new Error("MeProvider is not found");
  }
  return ctx;
};
