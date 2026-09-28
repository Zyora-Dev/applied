import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getAdmin } from "@/lib/admin-session";

export const metadata: Metadata = { title: "Dashboard | Applied AI" };

export default async function AdminPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return <AdminDashboard email={admin.email} />;
}