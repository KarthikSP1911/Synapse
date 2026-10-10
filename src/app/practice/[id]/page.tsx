import PracticeSession from "@/components/practice-session";

export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="pt-10">
      <PracticeSession sessionId={id} />
    </div>
  );
}
