"use client";

import { useCallback, useEffect, useState } from "react";
import { loadPracticeSound, practiceSoundPlayer, savePracticeSound } from "@/features/skills/lib/practice/practice-sound";

/** The practice sound choice and the shared player. The saved choice is read after mount, so the server and first client render match. */
export function usePracticeSound() {
  const player = practiceSoundPlayer();
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = loadPracticeSound();
      setSoundOn(saved);
      player.setEnabled(saved);
    }, 0);
    return () => clearTimeout(timer);
  }, [player]);

  const changeSound = useCallback(
    (next: boolean) => {
      setSoundOn(next);
      player.setEnabled(next);
      savePracticeSound(next);
      // Turning sound on is a tap, which is when a browser lets audio start.
      if (next) player.unlock();
    },
    [player]
  );

  return { player, soundOn, changeSound };
}
