import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SkillPractice from "@/features/skills/components/skill-practice";
import { requireViewer } from "@/features/auth/server/auth";
import { SKILL_META } from "@/features/skills/lib/meta";
import { parseSkillParam } from "@/features/skills/lib/routes";

type Props = { params: Promise<{ skill: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const skill = parseSkillParam((await params).skill);
  return skill ? { title: SKILL_META[skill].title } : {};
}

/**
 * One page per skill (`/skills/multiplication`, `/skills/square`, ...): its options, the session panel and the Start
 * button. The practice session itself still runs at `/play?s=<id>`.
 */
export default async function SkillPage({ params }: Props) {
  const skill = parseSkillParam((await params).skill);
  if (!skill) notFound();
  await requireViewer();
  return <SkillPractice skill={skill} />;
}
