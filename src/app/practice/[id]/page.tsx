import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { playHref } from "@/lib/local-store";
import { parseId } from "@/lib/validation";

export const metadata = { title: "Practice" };

/**
 * Practice now runs from the device-local store on `/play` (so it works offline). This route only keeps
 * old links alive: a guest's session opens there, and an account's older server-side session shows its results.
 */
export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const id = parseId((await params).id);
  if (id === null) notFound();
  redirect(viewer.kind === "guest" ? playHref(id) : `/practice/${id}/summary`);
}
