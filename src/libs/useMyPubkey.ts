import { createResource } from "solid-js";
import { useNIP07 } from "./useNIP07";

const [pubkey] = createResource(() => useNIP07().getPublicKey());

export const useMyPubkey = () => {
  return pubkey;
};
