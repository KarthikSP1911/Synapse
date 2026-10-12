import SudokuApp from "@/components/sudoku/sudoku-app";

export const metadata = { title: "Sudoku" };

/**
 * One static page for the whole game (setup, play and results are client-side states), so the service worker can
 * cache it once and it keeps working with no connection. Games are saved on the device; see `src/lib/sudoku`.
 */
export default function SudokuPage() {
  return <SudokuApp />;
}
