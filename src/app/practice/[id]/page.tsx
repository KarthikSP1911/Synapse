import PracticeSession from "@/components/practice-session";
import { requireViewer } from "@/lib/auth";

export const metadata = { title: "Practice" };

export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  return <PracticeSession sessionId={id} guest={viewer.kind === "guest"} />;
}
