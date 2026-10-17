import type { CSSProperties, ReactNode } from "react";
import { ACCENT } from "@/lib/accent";
import type { UiTile } from "@/features/games/game2048/lib/tiles";
import { SIZE, WIN_TILE } from "@/features/games/game2048/lib/types";

/**
 * The 4x4 board: empty cells underneath, the tiles on top, and an optional overlay (win, game over) over both.
 * It only draws. Swiping is handled by the play area around it (`useSwipe`), so a swipe works anywhere on the
 * screen and the browser never scrolls or zooms while the game is being played.
 */
export function Board({ tiles, overlay, description }: { tiles: readonly UiTile[]; overlay?: ReactNode; description: string }) {
  return (
    <div data-timer-clear className="g48-board relative w-full" style={{ "--g48": ACCENT.game2048 } as CSSProperties}>
      <div className="g48-frame" role="group" aria-label={description} tabIndex={0}>
        <div className="g48-cells" aria-hidden>
          {Array.from({ length: SIZE * SIZE }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <div className="g48-tiles" aria-hidden>
          {tiles.map((t) => (
            <div key={t.id} className="g48-tile" data-value={t.value} data-digits={String(t.value).length} data-super={t.value > WIN_TILE} data-ghost={t.ghost} data-merged={t.merged} style={{ "--r": Math.floor(t.index / SIZE), "--c": t.index % SIZE } as CSSProperties}>
              <span data-fresh={t.fresh} data-merged={t.merged}>
                {t.value}
              </span>
            </div>
          ))}
        </div>
      </div>
      {overlay}
    </div>
  );
}
