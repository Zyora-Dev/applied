import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { getAdmin } from "@/lib/admin-session";

export default async function LoginPage() {
  if (await getAdmin()) redirect("/admin");
  return <AuthShell><LoginForm /></AuthShell>;
}