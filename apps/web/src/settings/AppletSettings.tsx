import { intentHandlers } from "@streets/core/napplet/intent";
import { emptyAppletLibrary } from "@streets/core/napplet/library";
import type { Component } from "solid-js";
import { useAppletIntents } from "../napplet/applet-intents";
import { useAppletLibrary } from "../napplet/applet-library";
import { useDispatch } from "../ui-events";
import AppletSettingsView, { type IntentRole } from "./AppletSettingsView";

/** アップレットのページ。候補はインストール済みのアップレットと Streets のカラム。 */
const AppletSettings: Component = () => {
  const dispatch = useDispatch();
  const library = useAppletLibrary();
  const intents = useAppletIntents();
  const catalog = () => intents?.catalog() ?? [];
  const roles = (): IntentRole[] =>
    intentHandlers(catalog(), library() ?? emptyAppletLibrary()).map(
      (availability) => ({
        archetype: availability.archetype,
        options: availability.candidates.map((candidate) => ({
          value: candidate.id,
          title:
            candidate.id === "streets" ? "Streets のカラム" : candidate.title,
        })),
        current: availability.candidates.find((c) => c.isDefault)?.id,
      }),
    );
  return (
    <AppletSettingsView
      roles={roles()}
      onChange={(archetype, value) => {
        const handler = catalog().find((item) => item.id === value);
        dispatch({
          type: "applets/set-default",
          archetype,
          ...(handler
            ? {
                target:
                  handler.type === "streets"
                    ? { type: "streets" as const }
                    : { type: "applet" as const, ...handler.applet },
              }
            : {}),
        });
      }}
    />
  );
};

export default AppletSettings;
