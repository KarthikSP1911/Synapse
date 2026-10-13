import { redirect } from "next/navigation";
import AuthForm from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { getCurrentUser } from "@/features/auth/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <AuthShell eyebrow="Get started" title="Create your account" description="Your questions, accuracy and streak are saved to your account on any device.">
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
