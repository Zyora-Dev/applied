"use client";

import { useState } from "react";
import { AudioLines, ChevronRight, GraduationCap, LayoutDashboard, Menu, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/logout-button";
import { StudentOverview, Students } from "@/components/students";
import { Faculty } from "@/components/faculty";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "students", label: "Students", icon: Users },
  { id: "faculty", label: "Faculty", icon: GraduationCap },
  { id: "account", label: "Admin account", icon: ShieldCheck },
] as const;

export function AdminDashboard({ email }: { email: string }) {
  const [active, setActive] = useState<(typeof navigation)[number]["id"]>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const title = navigation.find(item => item.id === active)!.label;

  function navigate(view: typeof active) {
    setActive(view);
    setMenuOpen(false);
  }

  return <div className="dashboard-shell">
    <header className="dashboard-mobile-header">
      <span className="font-semibold">Applied AI</span>
      <Button variant="ghost" size="icon" aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={menuOpen} aria-controls="dashboard-sidebar" onClick={() => setMenuOpen(!menuOpen)}>
        {menuOpen ? <X /> : <Menu />}
      </Button>
    </header>
    <aside id="dashboard-sidebar" className={`dashboard-sidebar ${menuOpen ? "is-open" : ""}`}>
      <a className="brand dashboard-brand" href="#main-content" onClick={() => navigate("overview")}>
        <span className="brand-symbol"><AudioLines size={23} aria-hidden="true" /></span>
        <span className="brand-name">Applied AI<span>ARUNACHALA</span></span>
      </a>
      <div className="workspace-label"><GraduationCap size={18} aria-hidden="true" /><span>Course administration</span></div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Admin navigation">
        {navigation.map(({ id, label, icon: Icon }) => <button key={id} type="button"
          className={`dashboard-nav-item ${active === id ? "is-active" : ""}`}
          aria-current={active === id ? "page" : undefined} onClick={() => navigate(id)}>
          <Icon size={18} aria-hidden="true" /><span>{label}</span>{active === id && <ChevronRight size={15} aria-hidden="true" />}
        </button>)}
      </nav>
      <div className="sidebar-account">
        <div className="sidebar-identity"><span className="admin-avatar"><UserRound size={19} aria-hidden="true" /></span>
          <div><strong>Administrator</strong><span title={email}>{email}</span></div>
        </div>
        <LogoutButton />
      </div>
    </aside>
    <div className="dashboard-workspace">
      <header className="dashboard-topbar"><div>Workspace <ChevronRight size={14} aria-hidden="true" /><strong>{title}</strong></div>
        <span className="admin-badge"><ShieldCheck size={14} aria-hidden="true" />Administrator</span>
      </header>
      <main id="main-content" className="dashboard-content" tabIndex={-1}>
        <div className="dashboard-heading"><div><p className="eyebrow">APPLIED AI CONSOLE</p><h1>{active === "overview" ? "Dashboard" : title}</h1>
          <p className="dashboard-description">{active === "overview" ? "Student enrollment overview." : active === "students" ? "Student records and contact details." : active === "faculty" ? "Faculty accounts." : "Your administrator profile."}</p></div>
        </div>
        {active === "overview" && <StudentOverview openStudents={() => navigate("students")} />}
        {active === "students" && <Students />}
        {active === "faculty" && <Faculty />}
        {active === "account" && <section className="dashboard-section course-detail"><div className="section-heading"><h2>Account details</h2><ShieldCheck size={20} aria-hidden="true" /></div>
          <dl className="course-facts"><div><dt>Email address</dt><dd>{email}</dd></div><div><dt>Role</dt><dd>Administrator</dd></div></dl>
        </section>}
        <footer className="dashboard-footer"><span>Arunachala Hitech Engineering College</span><span>Applied AI / Administration</span></footer>
      </main>
    </div>
  </div>;
}