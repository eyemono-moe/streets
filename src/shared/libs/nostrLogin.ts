export const showLoginModal = () => {
  import("nostr-login").then(({ launch }) => {
    launch();
  });
};
