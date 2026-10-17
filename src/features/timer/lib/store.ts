import { StudyTimerController, type TimerBackend, type TimerHost } from "./controller";
import { performAlert } from "./alert";
import { loadTimer, saveTimer } from "./storage";

/** The one controller for this page. Created on first use in the browser; the server never has a timer. */

const browserHost: TimerHost = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

const browserBackend: TimerBackend = {
  load: (viewer, now) => loadTimer(viewer, now),
  save: (viewer, timer) => saveTimer(viewer, timer),
};

let controller: StudyTimerController | null = null;

export function studyTimer(): StudyTimerController {
  controller ??= new StudyTimerController(browserHost, browserBackend, performAlert);
  return controller;
}
