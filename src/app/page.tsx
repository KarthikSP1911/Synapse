import { redirect } from "next/navigation";
import PracticeHub from "@/features/skills/components/practice-hub";
import { getSkillSummaries } from "@/features/progress/server/progress-queries";
import { legacySkillRedirect } from "@/features/skills/lib/routes";
import { requireViewer } from "@/features/auth/server/auth";

// The skill cards show live progress, so the page is rendered per request.
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  // `/?skill=<skill>` used to pick a skill on this page. Skills have their own pages now; old links still land on the right one.
  const target = legacySkillRedirect((await searchParams).skill);
  if (target) redirect(target);

  const viewer = await requireViewer();

  // Progress is a nicety: if the database is unreachable the hub still works. A guest's
  // progress is in their browser, so the hub reads it there.
  const summaries =
    viewer.kind === "guest"
      ? null
      : await getSkillSummaries(viewer.user.id).catch((error) => {
          console.error("Failed to load skill summaries:", error);
          return null;
        });

  return (
    <div className="container py-8 sm:py-10">
      <h1 className="sr-only">Practice</h1>
      <PracticeHub summaries={summaries} />
    </div>
  );
}
