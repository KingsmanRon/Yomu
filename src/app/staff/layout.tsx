import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "@/config/app";
import { StaffShell } from "@/staff/StaffShell";

export const metadata: Metadata = {
  title: `${APP_NAME} for facilitators and organisations`,
  robots: { index: false },
};

/** Staff pages: separate from the learner app (no service worker caching, plain text, English). */
export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StaffShell>{children}</StaffShell>;
}
