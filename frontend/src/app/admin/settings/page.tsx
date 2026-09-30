import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-session";
import { AdminDashboard } from "@/components/admin-dashboard";
import { EmailSettingsPanel } from "@/components/email-settings";
import { PasswordSettings } from "@/components/password-settings";

export const metadata: Metadata = { title: "Settings | Applied AI", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const admin = await requireAdmin();
  return <AdminDashboard admin={admin} section="Settings"><h1 className="text-lg font-semibold">Settings</h1><PasswordSettings /><EmailSettingsPanel /></AdminDashboard>;
}