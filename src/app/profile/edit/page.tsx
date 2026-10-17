import { redirect } from "next/navigation";
import { Page, PageHeader } from "@/components/layout/page-header";
import { requireViewer } from "@/features/auth/server/auth";
import { ProfileForm } from "@/features/profile/components/profile-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit profile" };

export default async function EditProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const viewer = await requireViewer();
  // A guest has no account to put a profile on.
  if (viewer.kind === "guest") redirect("/signup");
  const { user } = viewer;
  const welcome = (await searchParams).welcome === "1";

  return (
    <Page narrow>
      <PageHeader
        eyebrow={welcome ? "Welcome to Synapse" : "Profile"}
        title={welcome ? "Set up your profile" : "Edit profile"}
        description={
          welcome
            ? "Pick a picture and tell us a little about you. Everything here can be changed later."
            : "Choose how you appear on Synapse. Your email stays private."
        }
      />
      <ProfileForm
        welcome={welcome}
        initialValues={{
          username: user.username ?? "",
          displayName: user.displayName ?? "",
          avatar: user.avatar,
          bio: user.bio ?? "",
          location: user.location ?? "",
          goal: user.goal ?? "",
          level: user.level ?? "",
        }}
      />
    </Page>
  );
}
