import { showsOnWelcome, welcomeColumn } from "@streets/core/deck/welcome-feed";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { PAGE_SIZE } from "@streets/core/read/source";
import { createSection } from "@streets/core/solid/create-section";
import { type Component, createSignal } from "solid-js";
import AboutDialog from "../about/AboutDialog";
import EventListColumn from "../columns/EventListColumn";
import { useIsWide } from "../is-wide";
import { ReadLayerProvider } from "../read-layer";
import type { Session } from "../session";
import { Mediates } from "../ui-events";
import WelcomeView from "./WelcomeView";
import { WELCOME_RELAYS as RELAYS } from "./welcome-relays";

const COLUMN = welcomeColumn(RELAYS);

/** 入口に流す投稿。見せるだけで、スレッドやユーザーを重ねる先は無い。 */
const WelcomeFeed: Component<{ readLayer: ReadLayer }> = (props) => {
  const section = createSection({
    manager: props.readLayer.manager,
    pageSize: PAGE_SIZE,
    source: () => ({
      type: "nostr",
      filters: [{ kinds: [1] }],
      relays: [...RELAYS],
    }),
  });
  return (
    // 投稿を押したときの「重ねる」などを受ける段が無い。親まで渡さずここで止める。
    <Mediates handle={() => true}>
      <EventListColumn
        column={COLUMN}
        items={section.items().filter(showsOnWelcome)}
        section={section}
        paged
      />
    </Mediates>
  );
};

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
      </ReadLayerProvider>
      <AboutDialog open={aboutOpen()} wide={wide()} />
    </Mediates>
  );
};

export default WelcomeScreen;
