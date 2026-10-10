import {
  DEFAULT_RECENT_WINDOW,
  DEFAULT_WEAK_FOCUS_PERCENT,
  MAX_RECENT_WINDOW,
  MAX_WEAK_FOCUS_PERCENT,
  isIntInRange,
} from "@/lib/validation";

export interface Settings {
  weakFocusPercent: number;
  recentWindow: number;
}

export const DEFAULT_SETTINGS: Settings = {
  weakFocusPercent: DEFAULT_WEAK_FOCUS_PERCENT,
  recentWindow: DEFAULT_RECENT_WINDOW,
};

const STORAGE_KEY = "math-trainer:settings";

export function loadSettings(): Settings {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      parsed &&
      isIntInRange(parsed.weakFocusPercent, 0, MAX_WEAK_FOCUS_PERCENT) &&
      isIntInRange(parsed.recentWindow, 0, MAX_RECENT_WINDOW)
    ) {
      return { weakFocusPercent: parsed.weakFocusPercent, recentWindow: parsed.recentWindow };
    }
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
