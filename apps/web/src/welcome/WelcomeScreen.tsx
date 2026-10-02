import type { ColumnDef } from "@streets/core/deck/deck";
import {
  showsOnWelcome,
  welcomeColumns,
} from "@streets/core/deck/welcome-feed";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { type Component, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import AboutDialog from "../about/AboutDialog";
import { ColumnScope } from "../columns/column-scope";
import { type ColumnInputs, columnView } from "../columns/column-views";
import { useIsWide } from "../is-wide";
import { ReadLayerProvider } from "../read-layer";
import type { Session } from "../session";
import { Mediates } from "../ui-events";
import { WELCOME_RELAYS as RELAYS } from "./welcome-relays";
import WelcomeView from "./WelcomeView";

const COLUMNS = welcomeColumns(RELAYS);

/** ログインしていない人の値。どのカラムも、人に紐づく値を読まない種類だけを並べる。 */
const SIGNED_OUT: ColumnInputs = {
  viewer: "",
  followees: () => [],
  relayList: () => ({ phase: "signed-out" }),
  bookmarks: () => [],
  searchRelays: () => [],
};

/** 入口のカラムの中身。デッキのカラムと同じ表から描き、閲覧注意は出さない。 */
const WelcomeColumnContent: Component<{
  column: ColumnDef;
  readLayer: ReadLayer;
}> = (props) => (
  // 投稿を押したときの「重ねる」などを受ける段が無い。親まで渡さずここで止める。
  <Mediates handle={() => true}>
    <ColumnScope
      value={{
        column: () => props.column,
        readLayer: props.readLayer,
        shows: showsOnWelcome,
      }}
    >
      <Dynamic
        component={columnView(props.column.source).Content}
        source={props.column.source}
        inputs={SIGNED_OUT}
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
          columns={COLUMNS.map((column) => ({
            column,
            content: () => (
              <WelcomeColumnContent
                column={column}
                readLayer={props.readLayer}
              />
            ),
          }))}
        />
        {/* リリースノートの中の人の名前を読むので、読み取り層の中に置く。 */}
        <AboutDialog open={aboutOpen()} wide={wide()} />
      </ReadLayerProvider>
    </Mediates>
  );
};

export default WelcomeScreen;
