"use client";

import { useEffect, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BookOpen, LayoutDashboard, RefreshCw, UserRound } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { StudentSignout } from "@/components/student-signout";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/student/programme", label: "Programme", icon: BookOpen },
  { href: "/profile", label: "Profile", icon: UserRound },
];

const istFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
});

function StudentClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const initial = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);
  return <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-white">
    <time dateTime={now?.toISOString()} className="w-[11ch] tabular-nums">{now ? istFormatter.format(now).toUpperCase() : "--:--:-- --"}</time>
    <span className="text-primary">IST</span>
  </div>;
}

function StudentHeaderActions({ name, studentId }: { name: string; studentId: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  return <div className="ml-auto flex w-full min-w-0 items-center justify-end gap-2 sm:w-auto sm:gap-3">
    <div className="mr-auto sm:mr-2"><StudentClock /></div>
    <Tooltip>
      <TooltipTrigger render={<a href="https://wa.me/918940189694" target="_blank" rel="noopener noreferrer" />} aria-label="WhatsApp support: +91 89401 89694 (opens in a new tab)" className="grid size-9 shrink-0 place-items-center rounded-md text-[#25D366] outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary">
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="size-5">
          <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93a7.9 7.9 0 0 0-2.327-5.607M7.994 14.521a6.57 6.57 0 0 1-3.356-.918l-.24-.144-2.494.654.666-2.433-.156-.25a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.638-2.961 6.589-6.592 6.589m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.087.197-.232.296-.346.099-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.339-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.692.677-.692 1.654s.711 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232" />
        </svg>
      </TooltipTrigger>
      <TooltipContent side="bottom">WhatsApp support: +91 89401 89694</TooltipContent>
    </Tooltip>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />} title="Notifications" aria-label="Notifications" className="size-9 shrink-0 rounded-md text-white"><Bell className="size-4" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)] border border-white/20 p-4 text-white">
        <p className="font-semibold">Notifications</p>
        <div className="flex flex-col items-center gap-3 py-6 text-center"><Bell className="size-6 text-primary" /><p className="text-sm">No notifications yet.</p></div>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button variant="ghost" size="icon" title="Update page" aria-label={refreshing ? "Updating page" : "Update page"} disabled={refreshing} onClick={() => startRefresh(() => router.refresh())} className="size-9 shrink-0 rounded-md text-white"><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /></Button>
    <Link href="/profile" aria-label={`Account: ${name}, ${studentId}`} title="View profile" className="flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-full border border-white/25 bg-white/5 p-1 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary sm:pr-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"><UserRound className="size-4" /></span>
      <div className="hidden min-w-0 sm:block"><p className="max-w-36 truncate text-sm font-medium text-white">{name}</p><p className="max-w-36 truncate text-xs text-white">{studentId}</p></div>
    </Link>
  </div>;
}

function StudentNavigation() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return <SidebarMenu>{navigation.map(({ href, label, icon: Icon }) => (
    <SidebarMenuItem key={href}>
      <SidebarMenuButton render={<Link href={href} />} tooltip={label} isActive={pathname === href || pathname.startsWith(`${href}/`)} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined} onClick={() => setOpenMobile(false)} className="h-10 gap-3 rounded-md text-sm font-medium data-active:bg-primary/15 data-active:text-primary">
        <Icon /><span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  ))}</SidebarMenu>;
}

export function StudentShell({ name, studentId, children }: { name: string; studentId: string; children: ReactNode }) {
  const pathname = usePathname();
  const title = navigation.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`))?.label ?? "Dashboard";
  return <SidebarProvider style={{ "--sidebar-width": "13rem", "--sidebar-width-icon": "3.5rem" } as CSSProperties} className="text-sm leading-5">
    <a href="#student-content" className="sr-only z-50 rounded-md bg-primary p-3 text-black focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Skip to content</a>
    <Sidebar collapsible="icon" className="border-white/20">
      <SidebarHeader className="h-16 justify-center border-b border-white/20 px-3">
        <Link href="/dashboard" aria-label="Applied AI dashboard" title="Applied AI" className="flex min-w-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary [&_img]:w-28 group-data-[collapsible=icon]:[&_img]:w-8">
          <BrandLogo />
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-3 py-5 group-data-[collapsible=icon]:px-3">
        <StudentNavigation />
      </SidebarContent>
      <SidebarFooter className="gap-4 border-t border-white/20 px-3 py-4">
        <div className="flex min-w-0 items-center gap-3" title={`${name} / ${studentId}`}>
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-white/25"><UserRound className="size-4 text-primary" /></span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate font-medium text-white">{name}</p><p className="truncate text-xs text-white">{studentId}</p></div>
        </div>
        <div className="flex items-start gap-2 group-data-[collapsible=icon]:flex-col">
          <SidebarTrigger title="Toggle sidebar" className="size-8 shrink-0 rounded-md" />
          <StudentSignout />
        </div>
      </SidebarFooter>
    </Sidebar>
    <SidebarInset className="min-w-0 bg-[#080808]">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-white/20 bg-background px-4 py-3 sm:px-6">
        <SidebarTrigger title="Open navigation" className="size-9 rounded-md md:hidden" />
        <nav aria-label="Breadcrumb" className="min-w-0 font-medium"><span className="hidden text-white sm:inline">Student portal <span className="mx-2 text-primary">/</span></span><span aria-current="page">{title}</span></nav>
        <StudentHeaderActions name={name} studentId={studentId} />
      </header>
      <main id="student-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] space-y-7 p-4 outline-none sm:p-6 lg:p-8">{children}</main>
    </SidebarInset>
  </SidebarProvider>;
}