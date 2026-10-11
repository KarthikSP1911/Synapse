import { LocalPractice } from "@/components/local-practice";

export const metadata = { title: "Practice" };

/**
 * Practice for sessions stored on this device. It is a single page for every session (the id is in the
 * query string), so the service worker can cache it once and it keeps working with no connection.
 */
export default function PlayPage() {
  return <LocalPractice />;
}
