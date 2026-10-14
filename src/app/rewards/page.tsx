import { Page, PageHeader } from "@/components/layout/page-header";
import { requireViewer } from "@/features/auth/server/auth";
import { RewardsShop } from "@/features/rewards/components/rewards-shop";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rewards Shop" };

/**
 * The Rewards Shop. For guests and signed-in users alike: the page itself only checks that someone is using the app, and the
 * wallet is read in the browser (a guest's lives there; an account's is refreshed from the server by `RewardsShop`).
 */
export default async function RewardsPage() {
  await requireViewer();
  return (
    <Page narrow>
      <PageHeader eyebrow="Rewards" title="Rewards Shop" description="Earn coins by practising and playing. Spend them on Streak Shields to protect your streak and on hints when you are stuck." />
      <RewardsShop />
    </Page>
  );
}
