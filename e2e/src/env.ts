/** 開発用のリレー（10547）やアプリ（5173）と同時に動かせるよう、ポートをずらす。 */
export const RELAY_PORT = 10557;
export const APP_PORT = 5183;
export const RELAY_URL = `ws://localhost:${RELAY_PORT}`;
export const APP_URL = `http://localhost:${APP_PORT}`;
