import QueensApp from "@/features/games/queens/components/queens-app";

export const metadata = { title: "Queens" };

/** One static page for the whole game (setup, play and results are client-side states), so the service worker can cache it once. */
export default function QueensPage() {
  return <QueensApp />;
}
