import { Suspense } from "react";
import { OrgPage } from "@/staff/OrgPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-ink-soft">Loading…</p>}>
      <OrgPage />
    </Suspense>
  );
}
