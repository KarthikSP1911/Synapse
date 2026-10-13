import Game2048App from "@/features/games/game2048/components/game2048-app";

export const metadata = { title: "2048" };

/**
 * One static page for the whole game (play and statistics are client-side states), so the service worker can cache
 * it once and it keeps working with no connection. Games are saved on the device; see `src/features/games/game2048/lib`.
 */
export default function Game2048Page() {
  return <Game2048App />;
}
