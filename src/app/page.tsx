import PracticeSetup from "@/components/practice-setup";
import { getSkillSummaries } from "@/lib/progress-queries";
import { SKILLS, type Skill } from "@/lib/skills/types";
import { requireViewer } from "@/lib/auth";

// The skill cards show live progress, so the page is rendered per request.
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const viewer = await requireViewer();
  const { skill } = await searchParams;
  const initialSkill: Skill = SKILLS.includes(skill as Skill) ? (skill as Skill) : "multiplication";

  // Progress is a nicety: if the database is unreachable the setup screen still works. A guest's
  // progress is in their browser, so the setup screen reads it there.
  const summaries =
    viewer.kind === "guest"
      ? null
      : await getSkillSummaries(viewer.user.id).catch((error) => {
          console.error("Failed to load skill summaries:", error);
          return null;
        });

  return (
    <div className="container py-8 sm:py-10">
      <h1 className="sr-only">Start a practice session</h1>
      <PracticeSetup initialSkill={initialSkill} summaries={summaries} />
    </div>
  );
}
