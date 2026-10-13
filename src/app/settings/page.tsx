import SettingsForm from "@/features/settings/components/settings-form";
import { Page, PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Page narrow>
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Tune how questions are chosen and how practice feels. Preferences are stored in this browser."
      />
      <SettingsForm />
    </Page>
  );
}
