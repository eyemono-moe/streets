import type { IntentDelivery } from "@streets/core/napplet/intent";
import type { AppletAddress } from "@streets/core/napplet/library";
import {
  type Accessor,
  createContext,
  createSignal,
  useContext,
} from "solid-js";

/**
 * 1 本のカラム（重ねた段も含む）に預けた、アップレットへの依頼。依頼を開いたカラムの
 * 中で、そのアップレットを見せている段が受け取る。
 *
 * デッキ全体で 1 つにしないのは、同じアップレットを 2 本のカラムで開いていると、
 * 別のカラムのほうに届くことがあるため。
 */
export type ColumnDeliveries = {
  push: (applet: AppletAddress, delivery: IntentDelivery) => void;
  take: (applet: AppletAddress) => IntentDelivery[];
  /** 預けるたびに変わる。受け取る側が見張る。 */
  pending: Accessor<number>;
};

const keyOf = (applet: AppletAddress) =>
  `${applet.pubkey}:${applet.identifier}`;

export const createColumnDeliveries = (): ColumnDeliveries => {
  const queued = new Map<string, IntentDelivery[]>();
  const [pending, setPending] = createSignal(0);
  return {
    push: (applet, delivery) => {
      const key = keyOf(applet);
      queued.set(key, [...(queued.get(key) ?? []), delivery]);
      setPending((count) => count + 1);
    },
    take: (applet) => {
      const key = keyOf(applet);
      const deliveries = queued.get(key) ?? [];
      queued.delete(key);
      return deliveries;
    },
    pending,
  };
};

const ColumnDeliveriesContext = createContext<ColumnDeliveries>();

export const ColumnDeliveriesProvider = ColumnDeliveriesContext.Provider;

export const useColumnDeliveries = (): ColumnDeliveries | undefined =>
  useContext(ColumnDeliveriesContext);
