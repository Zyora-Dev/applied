import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin-login";

export const metadata: Metadata = {
  title: "Admin sign in | Applied AI",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <AdminLogin />;
}