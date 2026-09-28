"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, AudioLines, BookOpen, Clock3, ExternalLink, LayoutDashboard, Link2, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LogoutButton } from "@/components/logout-button";
import { StudentWeeks } from "@/components/student-weeks";
import type { StudentAccount } from "@/lib/student-session";
import "./student-dashboard.css";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "course", label: "My course", icon: BookOpen },
  { id: "profile", label: "My profile", icon: UserRound },
] as const;

type View = (typeof navigation)[number]["id"];
const topics = ["PyTorch", "Dataset validation", "Transformers", "Hugging Face", "Retrieval-augmented generation (RAG)"];
const schedule = [["Monday", "In person"], ["Friday & Saturday", "Google Meet"], ["Session length", "2 hours"], ["Programme duration", "4 weeks"], ["Learning format", "Individual"]];

function StudentAvatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <Avatar size={large ? "lg" : "default"}><AvatarFallback>{initials}</AvatarFallback></Avatar>;
}

function StudentIdentityHeader({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer = window.setTimeout(refresh, 0);
    function refresh() {
      setNow(new Date());
      timer = window.setTimeout(refresh, 1000);
    }
    return () => window.clearTimeout(timer);
  }, []);

  const hour = now?.getHours();
  const greeting = hour === undefined ? "Welcome" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return <CardHeader>
    <CardDescription>{greeting}</CardDescription>
    <CardTitle><h2>{name}</h2></CardTitle>
    <CardAction><span aria-hidden="true"><StudentAvatar name={name} large /></span></CardAction>
    <div className="student-identity-datetime">
      {now && <time dateTime={now.toISOString()}>
        <span>{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
        <span>{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZoneName: "short" })}</span>
      </time>}
    </div>
  </CardHeader>;
}

function Details({ items }: { items: string[][] }) {
  return <dl className="student-detail-list">{items.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
  )}</dl>;
}

function ProfileLinks({ student }: { student: StudentAccount }) {
  return <div className="student-profile-links">
    {[{ label: "GitHub", url: student.github_url, icon: Link2 }, { label: "LinkedIn", url: student.linkedin_url, icon: UserRound }].map(({ label, url, icon: Icon }) =>
      <div key={label} className="student-profile-link">
        <Icon size={16} aria-hidden="true" />
        {url ? <Button asChild variant="link"><a href={url} target="_blank" rel="noopener noreferrer">{label}<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></Button>
          : <><span>{label}</span><Badge variant="outline">Not added</Badge></>}
      </div>
    )}
  </div>;
}

function StudentNavigation({ active, onNavigate }: { active: View; onNavigate: (view: View) => void }) {
  const { setOpenMobile } = useSidebar();
  function navigate(view: View) {
    setOpenMobile(false);
    onNavigate(view);
  }

  return <Sidebar collapsible="offcanvas" className="student-sidebar">
    <SidebarHeader className="student-nav student-nav-header">
      <Button variant="ghost" className="student-brand" onClick={() => navigate("overview")}>
        <span className="student-brand-mark"><AudioLines aria-hidden="true" /></span>
        <span>Applied AI<small>Arunachala</small></span>
      </Button>
      <div className="student-mobile-close"><SidebarTrigger aria-label="Close navigation" /></div>
    </SidebarHeader>
    <SidebarContent className="student-nav">
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu aria-label="Student navigation">
            {navigation.map(({ id, label, icon: Icon }) => <SidebarMenuItem key={id}>
              <SidebarMenuButton isActive={active === id} aria-current={active === id ? "page" : undefined} onClick={() => navigate(id)}>
                <Icon aria-hidden="true" /><span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter className="student-nav student-nav-footer">
      <Separator />
      <LogoutButton audience="student" />
    </SidebarFooter>
  </Sidebar>;
}

export function StudentDashboard({ student }: { student: StudentAccount }) {
  const [active, setActive] = useState<View>("overview");
  const mainRef = useRef<HTMLElement>(null);
  const title = navigation.find(item => item.id === active)!.label;
  function navigate(view: View) {
    setActive(view);
    mainRef.current?.focus();
  }

  return <TooltipProvider>
    <SidebarProvider className="student-console" style={{ "--sidebar-width": "15rem" } as CSSProperties}>
      <a className="student-skip-link" href="#student-main">Skip to content</a>
      <StudentNavigation active={active} onNavigate={navigate} />
      <div className="student-workspace">
        <header className="student-header">
          <div className="student-header-path">
            <Tooltip><TooltipTrigger asChild><SidebarTrigger /></TooltipTrigger><TooltipContent>Toggle navigation</TooltipContent></Tooltip>
            <Separator orientation="vertical" />
            <Breadcrumb><BreadcrumbList>
              <BreadcrumbItem className="student-breadcrumb-parent">Workspace</BreadcrumbItem>
              <BreadcrumbSeparator className="student-breadcrumb-parent" />
              <BreadcrumbItem><BreadcrumbPage>{title}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList></Breadcrumb>
          </div>
        </header>

        <main id="student-main" ref={mainRef} tabIndex={-1} className="student-main">
          <div className="student-page-title"><h1>{title}</h1></div>

          {active === "overview" && <div className="student-overview">
            <Card className="student-identity-card">
              <StudentIdentityHeader name={student.name} />
              <CardFooter>
                <dl><dt>Student ID</dt><dd>{student.student_id}</dd></dl>
                <Button size="lg" onClick={() => navigate("profile")}>View profile<ArrowUpRight aria-hidden="true" /></Button>
              </CardFooter>
            </Card>
            <section className="student-programme" aria-labelledby="student-programme-heading">
              <div className="student-section-label"><h2 id="student-programme-heading">Your programme</h2><span>Applied AI</span></div>
              <Card className="student-course-card">
                <CardHeader>
                  <div className="student-course-art"><BookOpen aria-hidden="true" /><span>APPLIED AI</span><Badge>4 weeks</Badge></div>
                  <CardTitle><h3>Applied Artificial Intelligence</h3></CardTitle>
                  <p className="student-course-subtitle">PyTorch, Transformers &amp; RAG</p>
                </CardHeader>
                <CardContent>
                  <div className="student-course-facts"><span><Clock3 size={15} aria-hidden="true" />2-hour sessions</span><span><UserRound size={15} aria-hidden="true" />Individual learning</span></div>
                  <div className="student-topic-badges">{["PyTorch", "Transformers", "Hugging Face", "RAG"].map(topic => <Badge key={topic} variant="outline">{topic}</Badge>)}</div>
                </CardContent>
                <CardFooter><span>Programme overview</span><Button onClick={() => navigate("course")}>View course<ArrowUpRight aria-hidden="true" /></Button></CardFooter>
              </Card>
              <StudentWeeks />
            </section>
          </div>}

          {active === "course" && <section aria-label="Course details">
            <div className="student-course-heading"><span className="student-course-emblem"><BookOpen aria-hidden="true" /></span><div><h2>Applied Artificial Intelligence</h2><p>4 weeks <span aria-hidden="true">/</span> 2-hour sessions <span aria-hidden="true">/</span> Individual learning</p></div></div>
            <Tabs defaultValue="topics" className="student-tabs">
              <TabsList variant="line" aria-label="Course information"><TabsTrigger value="topics">Programme topics</TabsTrigger><TabsTrigger value="schedule">Weekly format</TabsTrigger></TabsList>
              <TabsContent value="topics"><ol className="student-topic-list">{topics.map((topic, index) => <li key={topic}><span>{String(index + 1).padStart(2, "0")}</span><h3>{topic}</h3><BookOpen size={16} aria-hidden="true" /></li>)}</ol></TabsContent>
              <TabsContent value="schedule"><h3 className="student-tab-heading">Planned weekly format</h3><Details items={schedule} /></TabsContent>
            </Tabs>
          </section>}

          {active === "profile" && <section aria-label="Student profile">
            <div className="student-profile-heading"><StudentAvatar name={student.name} large /><div><h2>{student.name}</h2><p>{student.student_id}</p></div><Badge variant="outline">{student.degree}</Badge></div>
            <Tabs defaultValue="academic" className="student-tabs">
              <TabsList variant="line" aria-label="Profile information"><TabsTrigger value="academic">Academic details</TabsTrigger><TabsTrigger value="contact">Contact &amp; links</TabsTrigger></TabsList>
              <TabsContent value="academic"><Details items={[["Student ID", student.student_id], ["College", student.college], ["Degree", student.degree], ["Stream", student.stream]]} /></TabsContent>
              <TabsContent value="contact"><Details items={[["Email address", student.email], ["Mobile number", student.mobile]]} /><h3 className="student-tab-heading">Professional profiles</h3><ProfileLinks student={student} /></TabsContent>
            </Tabs>
          </section>}
          <footer className="student-footer"><span>Arunachala Hitech Engineering College</span><span>Applied AI</span></footer>
        </main>
      </div>
    </SidebarProvider>
  </TooltipProvider>;
}