import { notFound } from "next/navigation";
import { devToolsEnabled } from "@/server/devtools";
import { TutorLab } from "./TutorLab";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tutor lab (developers)", robots: { index: false } };

/** Developer tutor lab. Not part of the learner app; absent in production. */
export default function Page() {
  if (!devToolsEnabled()) notFound();
  return <TutorLab />;
}
