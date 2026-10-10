import PracticeSession from "@/components/practice-session";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Practice" };

export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  return <PracticeSession sessionId={id} />;
}
