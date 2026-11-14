import type {
  NappletHost,
  NappletSession,
} from "@streets/core/napplet/session";
import { toaster } from "../toast";

/** 短い間に出せる知らせの数。並べ立てて画面を埋めさせない。 */
const BURST = 5;
const BURST_WINDOW_MS = 10_000;
/** 急ぎの知らせは閉じるまで残るので、さらに絞る。 */
const URGENT_WINDOW_MS = 30_000;

const DURATION_MS = { normal: 5000, high: 8000 } as const;

let issued = 0;

/**
 * NAP-NOTIFY の知らせを、Streets のトーストで出す。出してよいかはアップレットごとに
 * 一度確かめて覚える。アップレットを閉じたら、出した知らせも片付ける。
 */
export const createNotifyHost = (options: {
  source: () => string;
  granted: () => boolean;
  grant: () => void;
  ask: () => Promise<boolean>;
  report: NappletSession["notifyEvent"];
}): { host: NappletHost["notify"]; dispose: () => void } => {
  const active = new Map<string, string>();
  const sentAt: number[] = [];
  let urgentAt = Number.NEGATIVE_INFINITY;

  const requestPermission = async () => {
    if (options.granted()) return true;
    const approved = await options.ask();
    if (approved) options.grant();
    return approved;
  };

  const close = (notificationId: string) => {
    const toastId = active.get(notificationId);
    if (!toastId) return;
    active.delete(notificationId);
    toaster.remove(toastId);
  };

  const host: NappletHost["notify"] = {
    requestPermission,
    dismiss: close,
    send: async (notification) => {
      if (!(await requestPermission())) return { error: "permission denied" };
      const now = Date.now();
      while (sentAt.length > 0 && (sentAt[0] ?? 0) < now - BURST_WINDOW_MS) {
        sentAt.shift();
      }
      if (sentAt.length >= BURST) return { error: "rate limited" };
      if (notification.priority === "urgent") {
        if (now - urgentAt < URGENT_WINDOW_MS) return { error: "rate limited" };
        urgentAt = now;
      }
      sentAt.push(now);
      issued += 1;
      const notificationId = `notice-${issued}`;
      // > `low` | Silent, no interruption. May appear in notification center only.
      // Streets に知らせの一覧は無いので、出さずに受け取ったことだけを返す。
      if (notification.priority === "low") return { notificationId };
      const toastId = `applet-notice-${issued}`;
      active.set(notificationId, toastId);
      toaster.create({
        id: toastId,
        type: "info",
        title: notification.title,
        ...(notification.body ? { description: notification.body } : {}),
        duration:
          notification.priority === "urgent"
            ? Number.POSITIVE_INFINITY
            : DURATION_MS[notification.priority],
        meta: {
          appletNotice: {
            source: options.source(),
            actions: notification.actions,
            onClick: () => {
              options.report({ type: "notify.clicked", notificationId });
              close(notificationId);
            },
            onAction: (actionId: string) => {
              options.report({
                type: "notify.action",
                notificationId,
                actionId,
              });
              close(notificationId);
            },
          },
        },
        onStatusChange: (details: { status: string }) => {
          if (details.status !== "unmounted" || !active.has(notificationId)) {
            return;
          }
          active.delete(notificationId);
          options.report({
            type: "notify.dismissed",
            notificationId,
            reason: "user",
          });
        },
      });
      return { notificationId };
    },
  };

  return {
    host,
    // > The shell MUST clean up all notifications for a napplet when the napplet's iframe
    // > is removed.
    dispose: () => {
      for (const notificationId of [...active.keys()]) close(notificationId);
    },
  };
};
