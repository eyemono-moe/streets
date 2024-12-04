interface NostrLoginEventMap {
  nlAuth: CustomEvent<
    | {
        type: "logout";
      }
    | {
        localNsec: string;
        relays: string[];
        type: "login" | "signup";
        method: AuthMethod;
        pubkey: string;
        otpData: string;
      }
  >;
}

declare global {
  interface DocumentEventMap extends NostrLoginEventMap {}
}

export {};
