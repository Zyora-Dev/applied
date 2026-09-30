"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { GraduationCap, LoaderCircle, LogOut, Users } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

function FacultyNavigation() {
  const { setOpenMobile } = useSidebar();
  return <SidebarMenu><SidebarMenuItem><SidebarMenuButton render={<Link href="/faculty" />} isActive tooltip="Students" onClick={() => setOpenMobile(false)} className="h-10 gap-3 data-active:bg-primary/15 data-active:text-primary"><Users /><span>Students</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>;
}

export function FacultyShell({ name, role, children }: { name: string; role: string; children: ReactNode }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/faculty/logout", { method: "POST", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error();
      window.location.replace("/faculty/login");
    } catch { setPending(false); setError("Unable to sign out. Please retry."); }
  }
  return <SidebarProvider style={{ "--sidebar-width": "13rem", "--sidebar-width-icon": "3.5rem" } as CSSProperties} className="text-sm text-white">
    <a href="#faculty-content" className="sr-only z-50 bg-primary p-3 text-black focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Skip to content</a>
    <Sidebar collapsible="icon" className="border-white/20">
      <SidebarHeader className="h-16 justify-center border-b border-white/20 px-3"><Link href="/faculty" aria-label="Applied AI faculty dashboard" className="[&_img]:w-28 group-data-[collapsible=icon]:[&_img]:w-8"><BrandLogo /></Link></SidebarHeader>
      <SidebarContent className="px-3 py-5"><FacultyNavigation /></SidebarContent>
      <SidebarFooter className="gap-4 border-t border-white/20 px-3 py-4">
        <div className="flex min-w-0 items-center gap-3" title={`${name} / ${role}`}><GraduationCap className="size-5 shrink-0 text-primary" /><div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate font-medium">{name}</p><p className="truncate text-xs">{role}</p></div></div>
        <div className="flex gap-2 group-data-[collapsible=icon]:flex-col"><SidebarTrigger title="Toggle sidebar" /><Button variant="ghost" size="icon" title="Sign out" aria-label="Sign out" onClick={signOut} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <LogOut />}</Button></div>
        {error && <p role="alert" className="text-xs">{error}</p>}
      </SidebarFooter>
    </Sidebar>
    <SidebarInset className="min-w-0 bg-[#080808]">
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-white/20 bg-background px-4 py-3 sm:px-6"><SidebarTrigger title="Open navigation" className="md:hidden" /><p className="font-medium">Faculty portal <span className="mx-2 text-primary">/</span> Students</p><span className="ml-auto max-w-full truncate">{name}</span></header>
      <main id="faculty-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] space-y-7 p-4 outline-none sm:p-6 lg:p-8">{children}</main>
    </SidebarInset>
  </SidebarProvider>;
}