import {
  everydayFollows,
  everydayPosts,
  everydayReactions,
  everydayReposts,
} from "../common/timeline";
import { defineScenario } from "../scenario";

/** ふだんのホームタイムライン。いろいろな人の投稿が並んでいる。 */
export default defineScenario({
  description: "ホームタイムライン：いろいろな人のふだんの投稿",
  viewer: "mio",
  follows: everydayFollows,
  posts: everydayPosts,
  reactions: everydayReactions,
  reposts: everydayReposts,
});
