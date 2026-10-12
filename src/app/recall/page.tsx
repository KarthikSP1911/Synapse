import RecallApp from "@/components/recall/recall-app";

export const metadata = { title: "Number Recall" };

/**
 * One static page for the whole game (setup, play and results are client-side states), so the service worker can
 * cache it once and it keeps working with no connection. Sessions are saved on the device; see `src/lib/recall`.
 */
export default function RecallPage() {
  return <RecallApp />;
}
