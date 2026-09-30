import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { FacultyForm, FacultyList, FacultyPage } from "@/components/faculty";
import { requireAdmin } from "@/lib/admin-session";

export const metadata: Metadata = { title: "Faculty | Applied AI", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const admin = await requireAdmin();
  const { path = [] } = await params;
  const list = path.length === 0;
  const create = path.length === 1 && path[0] === "new";
  const detail = path.length === 1 && /^[1-9]\d{0,15}$/.test(path[0]);
  const edit = path.length === 2 && /^[1-9]\d{0,15}$/.test(path[0]) && path[1] === "edit";
  if (!list && !create && !detail && !edit) notFound();
  return <AdminDashboard admin={admin} section="Faculty">
    {list ? <FacultyList /> : create ? <FacultyForm /> : <FacultyPage key={path.join("/")} id={path[0]} edit={edit} />}
  </AdminDashboard>;
}