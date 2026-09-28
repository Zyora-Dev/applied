import { AudioLines, LockKeyhole } from "lucide-react";
import Link from "next/link";

export function AuthShell({ children, audience = "admin" }: { children: React.ReactNode; audience?: "admin" | "student" }) {
  return (
    <div className={audience === "student" ? "auth-shell student-auth" : "auth-shell"}>
      <header className="site-header">
        <Link href={audience === "student" ? "/student" : "/"} className="brand" aria-label="Applied AI home">
          <span className="brand-symbol"><AudioLines size={24} strokeWidth={1.7} aria-hidden="true" /></span>
          <span className="brand-name">Applied AI<span>ARUNACHALA</span></span>
        </Link>
        <span className="header-label"><LockKeyhole size={14} aria-hidden="true" /> {audience === "student" ? "Student portal" : "Admin console"}</span>
      </header>
      <main className="auth-main">{children}</main>
      <footer className="site-footer">
        <span>Applied AI <span className="footer-divider">/</span> {audience === "student" ? "Students" : "Administration"}</span>
        <span>Arunachala College</span>
      </footer>
    </div>
  );
}