import PracticeSession from "@/components/practice-session";

export const metadata = { title: "Practice" };

export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PracticeSession sessionId={id} />;
}
