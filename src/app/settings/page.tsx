import SettingsForm from "@/components/settings-form";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your training preferences. They are stored in this browser.</p>
      </div>
      <SettingsForm />
    </div>
  );
}
