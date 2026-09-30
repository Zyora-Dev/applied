import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";
import { requireAdmin } from "@/lib/admin-session";

export const metadata: Metadata = {
  title: "Dashboard | Applied AI",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const admin = await requireAdmin();
  return <AdminDashboard admin={admin} />;
}