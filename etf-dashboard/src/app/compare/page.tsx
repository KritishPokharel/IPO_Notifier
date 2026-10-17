import { CompareView } from "@/components/dashboard/compare-view";
import { PageHeader } from "@/components/dashboard/empty";
import { SetupNotice } from "@/components/dashboard/market-banner";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const data = await getDashboardData();
  return (
    <>
      <PageHeader title="ETF comparison" description="Side-by-side performance, risk and cost for similar funds." />
      <SetupNotice data={data} />
      {data.snapshot ? <CompareView etfs={data.snapshot.etfs} /> : null}
    </>
  );
}
