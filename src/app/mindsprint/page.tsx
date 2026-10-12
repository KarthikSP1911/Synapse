import MindsprintApp from "@/components/mindsprint/mindsprint-app";

export const metadata = { title: "MindSprint" };

/**
 * One static page for the whole game (setup, play and results are client-side states), so the service worker can
 * cache it once and it keeps working with no connection. Sessions are saved on the device; see `src/lib/mindsprint`.
 */
export default function MindsprintPage() {
  return <MindsprintApp />;
}
