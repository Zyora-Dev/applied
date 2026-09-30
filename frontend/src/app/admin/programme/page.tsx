import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";
import { ProgrammeControls } from "@/components/programme-controls";
import { requireAdmin } from "@/lib/admin-session";
import { getProgrammeWeeks } from "@/lib/programme";

export const metadata: Metadata = { title: "Programme | Admin", robots: { index: false, follow: false } };

export default async function AdminProgrammePage() {
  const admin = await requireAdmin();
  const weeks = await getProgrammeWeeks("admin");
  return <AdminDashboard admin={admin} section="Programme"><h1 className="text-lg font-semibold">Programme</h1><ProgrammeControls initial={weeks} /></AdminDashboard>;
}