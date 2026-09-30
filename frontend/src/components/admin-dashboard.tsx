"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, CalendarDays, GraduationCap, LayoutDashboard, LoaderCircle, LogOut, Settings, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import type { AdminAccount } from "@/lib/admin-session";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";

export function AdminDashboard({ admin, children, section = "Dashboard" }: { admin: AdminAccount; children?: ReactNode; section?: "Dashboard" | "Students" | "Faculty" | "Programme" | "Settings" }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  });
  const summaryCards = [
    { label: "Account status", value: admin.is_active ? "Active" : "Inactive", icon: ShieldCheck },
    { label: "Access role", value: "Administrator", icon: UserRound },
    { label: "Member since", value: dateFormatter.format(new Date(admin.created_at)), icon: CalendarDays },
  ];

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed");
      window.location.replace("/admin/login");
    } catch {
      setError("Unable to sign out. Please try again.");
      setPending(false);
    }
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "14rem" } as CSSProperties} className="text-sm leading-5">
      <Sidebar className="border-border">
        <SidebarHeader className="h-14 justify-center border-b border-border px-4 py-0">
          <Link href="/admin" aria-label="Applied AI dashboard" className="w-fit rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&_img]:w-28"><BrandLogo /></Link>
        </SidebarHeader>
        <SidebarContent className="gap-3 px-3 py-4">
          <p className="px-2 text-sm font-medium text-foreground">Applied AI</p>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={section === "Dashboard"} render={<Link href="/admin" />} className="h-9 gap-2.5 rounded-md px-2 text-sm font-medium [&>svg]:size-4" aria-current={section === "Dashboard" ? "page" : undefined}>
                <LayoutDashboard /><span>Dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={section === "Students"} render={<Link href="/admin/students" />} className="h-9 gap-2.5 rounded-md px-2 text-sm font-medium [&>svg]:size-4" aria-current={section === "Students" ? "page" : undefined}>
                <UsersRound /><span>Students</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={section === "Faculty"} render={<Link href="/admin/faculty" />} className="h-9 gap-2.5 rounded-md px-2 text-sm font-medium [&>svg]:size-4" aria-current={section === "Faculty" ? "page" : undefined}>
                <GraduationCap /><span>Faculty</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={section === "Programme"} render={<Link href="/admin/programme" />} className="h-9 gap-2.5 rounded-md px-2 text-sm font-medium [&>svg]:size-4" aria-current={section === "Programme" ? "page" : undefined}>
                <BookOpen /><span>Programme</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={section === "Settings"} render={<Link href="/admin/settings" />} className="h-9 gap-2.5 rounded-md px-2 text-sm font-medium [&>svg]:size-4" aria-current={section === "Settings" ? "page" : undefined}>
                <Settings /><span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="gap-3 border-t border-border p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-md border border-border"><UserRound className="size-4 text-primary" /></div>
            <div className="min-w-0"><p className="text-sm font-medium">Administrator</p><p className="truncate text-sm text-foreground" title={admin.email}>{admin.email}</p></div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button variant="outline" className="h-9 w-full justify-start gap-2.5 rounded-md px-2 text-sm [&_svg]:size-4" onClick={signOut} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <LogOut />}{pending ? "Signing out..." : "Sign out"}
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-[#080808]">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 sm:px-6">
          <SidebarTrigger title="Toggle sidebar" className="size-8 rounded-md [&_svg]:size-4" />
          <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-foreground sm:inline">Applied AI</span>
            <span aria-hidden="true" className="hidden text-foreground sm:inline">/</span>
            <span aria-current="page" className="font-medium">{section}</span>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2.5">
            <span className="text-sm font-medium">Admin</span>
            <span className="grid size-8 place-items-center rounded-md border border-border bg-card"><UserRound className="size-4 text-primary" /></span>
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
          {children ?? <>
          <h1 className="text-lg font-semibold leading-7">Overview</h1>
          <section aria-label="Account overview" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {summaryCards.map(({ label, value, icon: Icon }) => (
              <Card key={label} className="min-w-0 gap-4 rounded-lg border border-border bg-[#111111] py-5 ring-0">
                <CardHeader className="items-center px-5">
                  <CardTitle className="text-sm font-medium"><h2>{label}</h2></CardTitle>
                  <CardAction><span className="grid size-8 place-items-center rounded-md border border-border bg-background"><Icon className="size-4 text-primary" /></span></CardAction>
                </CardHeader>
                <CardContent className="px-5">
                  <p className="text-lg font-semibold leading-7 tabular-nums">{value}</p>
                </CardContent>
              </Card>
            ))}
          </section>
          <Card className="gap-0 rounded-lg border border-border bg-[#111111] py-0 ring-0">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle className="text-base font-semibold"><h2>Account details</h2></CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
                <div className="min-w-0 space-y-2"><dt className="text-sm text-foreground">Email address</dt><dd className="text-sm font-medium break-all">{admin.email}</dd></div>
                <div className="space-y-2"><dt className="text-sm text-foreground">Account ID</dt><dd className="text-sm font-medium tabular-nums">#{admin.id}</dd></div>
                <div className="space-y-2"><dt className="text-sm text-foreground">Created on</dt><dd className="text-sm font-medium tabular-nums">{dateFormatter.format(new Date(admin.created_at))}</dd></div>
                <div className="space-y-2"><dt className="text-sm text-foreground">Last updated</dt><dd className="text-sm font-medium tabular-nums">{dateFormatter.format(new Date(admin.updated_at))}</dd></div>
              </dl>
            </CardContent>
          </Card>
          </>}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}