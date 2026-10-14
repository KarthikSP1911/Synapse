import PatchesApp from "@/features/games/patches/components/patches-app";

export const metadata = { title: "Patches" };

/** One static page for the whole game (setup, play and results are client-side states), so the service worker can cache it once. */
export default function PatchesPage() {
  return <PatchesApp />;
}
