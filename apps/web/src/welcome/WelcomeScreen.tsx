import { showsOnWelcome, welcomeColumn } from "@streets/core/deck/welcome-feed";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { type Component, createSignal } from "solid-js";
import AboutDialog from "../about/AboutDialog";
import EventList from "../columns/blocks/EventList";
import { ColumnScope } from "../columns/column-scope";
import { useIsWide } from "../is-wide";
import { ReadLayerProvider } from "../read-layer";
import type { Session } from "../session";
import { Mediates } from "../ui-events";
import { WELCOME_RELAYS as RELAYS } from "./welcome-relays";
import WelcomeView from "./WelcomeView";

const COLUMN = welcomeColumn(RELAYS);

/** 入口に流す投稿。見せるだけで、スレッドやユーザーを重ねる先は無い。 */
const WelcomeFeed: Component<{ readLayer: ReadLayer }> = (props) => (
  // 投稿を押したときの「重ねる」などを受ける段が無い。親まで渡さずここで止める。
  <Mediates handle={() => true}>
    <ColumnScope value={{ column: () => COLUMN, readLayer: props.readLayer }}>
      <EventList
        source={() => ({
          type: "nostr",
          filters: [{ kinds: [1] }],
          relays: [...RELAYS],
        })}
        filter={showsOnWelcome}
      />
    </ColumnScope>
  </Mediates>
);

const WelcomeScreen: Component<{ session: Session; readLayer: ReadLayer }> = (
  props,
) => {
  const wide = useIsWide();
  const [aboutOpen, setAboutOpen] = createSignal(false);
  return (
    // デッキの外なので、「Streets について」の開閉はこの画面が受け持つ。
    <Mediates
      handle={(event) => {
        switch (event.type) {
          case "deck/open-about":
            setAboutOpen(true);
            return true;
          case "deck/close-about":
            setAboutOpen(false);
            return true;
          default:
            return false;
        }
      }}
    >
      <ReadLayerProvider value={props.readLayer}>
        <WelcomeView
          narrow={!wide()}
          login={{
            pending: props.session.pending(),
            error: props.session.error(),
            authUrl: props.session.authUrl(),
            restoreFailed: props.session.restoreFailed(),
          }}
          onExtension={() => void props.session.loginWithExtension()}
          onBunker={(uri) => void props.session.loginWithBunker(uri)}
          onNostrConnect={props.session.loginWithNostrConnect}
          onRetryRestore={props.session.restore}
          feedTitle={COLUMN.title}
          feed={<WelcomeFeed readLayer={props.readLayer} />}
        />
        {/* リリースノートの中の人の名前を読むので、読み取り層の中に置く。 */}
        <AboutDialog open={aboutOpen()} wide={wide()} />
      </ReadLayerProvider>
    </Mediates>
  );
};

export default WelcomeScreen;
