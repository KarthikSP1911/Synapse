import SettingsForm from "@/components/settings-form";
import { Page, PageHeader } from "@/components/page-header";

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
