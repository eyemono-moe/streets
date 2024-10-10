type TwitterWidgetAPI = {
  widgets: {
    load(el?: HTMLElement): void;
  };
};

declare global {
  interface Window {
    twttr?: TwitterWidgetAPI;
  }
}

export {};
