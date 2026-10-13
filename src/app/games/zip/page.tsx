import ZipApp from "@/features/games/zip/components/zip-app";

export const metadata = { title: "Zip" };

/** One static page for the whole game (setup, play and results are client-side states), so the service worker can cache it once. */
export default function ZipPage() {
  return <ZipApp />;
}
