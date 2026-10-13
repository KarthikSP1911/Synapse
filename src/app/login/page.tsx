import { redirect } from "next/navigation";
import AuthForm from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { getCurrentUser, safeNextPath } from "@/features/auth/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { next } = await searchParams;
  const destination = safeNextPath(typeof next === "string" ? next : undefined);
  if (await getCurrentUser()) redirect(destination);

  return (
    <AuthShell eyebrow="Welcome back" title="Log in" description="Pick up where you left off: your progress and streak are waiting.">
      <AuthForm mode="login" next={destination === "/" ? undefined : destination} />
    </AuthShell>
  );
}
