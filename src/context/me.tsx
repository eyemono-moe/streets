import { waitNostr } from "nip07-awaiter";
import {
  init as initNostrLogin,
  launch as launchNostrLoginDialog,
} from "nostr-login";
import {
  type ParentComponent,
  createContext,
  createSignal,
  onMount,
  useContext,
} from "solid-js";
import { useI18n } from "../i18n";
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
  const t = useI18n();

  const [myPubkey, setMyPubkey] = createSignal<string | undefined>();

  // nip07の読み込み後にnostr loginを初期化しないとアカウント切り替え画面が表示されてしまう
  onMount(async () => {
    const n = await waitNostr(1000);
    await initNostrLogin({
      title: t("nostrLogin.title"),
      description: t("nostrLogin.description"),
    });
    // nip07が見つからなかった時はwelcome screenを表示する
    if (n === undefined) {
      launchNostrLoginDialog("welcome");
    }
  });

  // nostr loginでのログイン/ログアウトが発生した際にpubkeyを再取得する
  document.addEventListener("nlAuth", async (e) => {
    if (e.detail.type === "login" || e.detail.type === "signup") {
      const p = await useNIP07().getPublicKey();
      setMyPubkey(p);
    } else {
      setMyPubkey(undefined);
    }
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
    throw new Error("[context provider not found] MeProvider is not found");
  }
  return ctx;
};
