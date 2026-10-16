import NBackApp from "@/features/games/nback/components/nback-app";

export const metadata = { title: "N-Back" };

/** One static page for the whole game (setup, play and results are client-side states), so the service worker can cache it once. */
export default function NBackPage() {
  return <NBackApp />;
}
