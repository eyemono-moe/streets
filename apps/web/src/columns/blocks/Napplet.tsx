import { fetchNappletArtifact } from "@streets/core/napplet/artifact";
import type { NappletManifest } from "@streets/core/napplet/manifest";
import { prepareNappletSrcdoc } from "@streets/core/napplet/srcdoc";
import { type Component, Show, createMemo, createResource } from "solid-js";
import NappletFrame from "../../napplet/NappletFrame";
import NappletView, { type NappletPhase } from "../../napplet/NappletView";
import {
  STREETS_NAPPLET_DOMAINS,
  createStreetsNappletHost,
} from "../../napplet/streets-host";
import { currentNappletTheme } from "../../napplet/theme-colors";
import { useProfile } from "../../note/use-profile";
import { useMutes } from "../../settings/MuteMediator";
import { useColumnScope } from "../column-scope";
import type { ColumnInputs } from "../column-views";
import { createNappletManifest } from "./napplet-manifest";

const SUPPORTED: ReadonlySet<string> = new Set(STREETS_NAPPLET_DOMAINS);

/** NIP-5D の名前付き napplet を、マニフェストを引いて本体を照合してから動かす。 */
const Napplet: Component<{
  pubkey: string;
  identifier: string;
  relays?: readonly string[];
  inputs: ColumnInputs;
}> = (props) => {
  const scope = useColumnScope();
  const { lookup, manifest } = createNappletManifest({
    pubkey: () => props.pubkey,
    identifier: () => props.identifier,
    relays: () => props.relays,
  });
  const [artifact] = createResource(manifest, (current) =>
    fetchNappletArtifact(
      current.artifactHash,
      current.servers,
      globalThis.fetch.bind(globalThis),
    ),
  );

  const state = (): NappletPhase => {
    const current = lookup();
    if (current.phase === "loading") return { phase: "manifest-loading" };
    if (current.phase === "missing") return { phase: "manifest-missing" };
    if (current.phase === "invalid") {
      return { phase: "manifest-invalid", error: current.error };
    }
    const result = artifact();
    if (artifact.loading || result === undefined) {
      return { phase: "artifact-loading" };
    }
    return result.ok
      ? { phase: "ready" }
      : { phase: "artifact-failed", error: result.error };
  };
  const unsupported = () =>
    manifest()?.requires.filter((domain) => !SUPPORTED.has(domain)) ?? [];

  const viewer = () => (props.inputs.signedIn ? props.inputs.viewer : "");
  const profile = useProfile(() => viewer() || undefined);
  const mutes = useMutes();
  const ready = createMemo(() => {
    const current = manifest();
    const result = artifact();
    return current && result?.ok
      ? { manifest: current, html: result.html }
      : undefined;
  });

  const frame = (running: { manifest: NappletManifest; html: string }) => {
    let themeSource: Element | undefined;
    const host = createStreetsNappletHost({
      manifest: running.manifest,
      instance: scope.column().id,
      readLayer: scope.readLayer,
      viewer,
      relayList: props.inputs.relayList,
      profile: () => {
        const current = profile();
        return current
          ? Object.fromEntries(
              Object.entries({
                name: current.name,
                displayName: current.displayName,
                about: current.about,
                picture: current.picture,
                banner: current.banner,
                nip05: current.nip05,
              }).filter(([, value]) => value !== undefined),
            )
          : null;
      },
      follows: () => (viewer() ? props.inputs.followees() : []),
      mutes: () =>
        mutes
          ?.entries()
          .flatMap((entry) =>
            entry.target.type === "pubkey" ? [entry.target.value] : [],
          ) ?? [],
      theme: () =>
        themeSource
          ? currentNappletTheme(themeSource)
          : currentNappletTheme(document.body),
    });
    return (
      <div ref={(element) => (themeSource = element)} class="h-full">
        <NappletFrame
          html={prepareNappletSrcdoc(running.html, STREETS_NAPPLET_DOMAINS)}
          title={running.manifest.title ?? running.manifest.description}
          host={host}
          viewer={viewer()}
        />
      </div>
    );
  };

  return (
    <NappletView
      state={state()}
      unsupported={unsupported()}
      frame={
        <Show when={ready()} keyed>
          {frame}
        </Show>
      }
    />
  );
};

export default Napplet;
