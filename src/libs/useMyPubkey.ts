import { createResource } from "solid-js";
import { useNIP07 } from "./useNIP07";

const [pubkey, { refetch }] = createResource(async () => {
  try {
    const p = await useNIP07().getPublicKey();
    return p;
  } catch (e) {
    console.error(e);
    return;
  }
});

document.addEventListener("nlAuth", () => {
  refetch();
});

export const useMyPubkey = () => {
  return pubkey;
};

export const isLogged = () => {
  return !!pubkey();
};
