import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { Page, PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <Page narrow>
      <div className="mx-auto w-full max-w-md space-y-8">
        <PageHeader eyebrow="Get started" title="Create your account" description="Your questions, accuracy and streak are saved to your account on any device." />
        <AuthForm mode="signup" />
      </div>
    </Page>
  );
}
