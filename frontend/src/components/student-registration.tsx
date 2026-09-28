"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { StudentForm } from "@/components/students";

export function StudentRegistration() {
  return <section className="w-full max-w-2xl" aria-labelledby="register-title">
    <div className="login-emblem"><GraduationCap size={28} aria-hidden="true" /></div>
    <p className="eyebrow">STUDENT REGISTRATION</p>
    <h1 id="register-title" className="text-3xl font-semibold text-white">Create your account</h1>
    <div className="mt-8">
      <StudentForm student={null} selfRegistration saved={() => window.location.replace("/student")} />
    </div>
    <p className="mt-8 text-center text-sm text-white">Already registered? <Link href="/student/login" className="underline underline-offset-4">Sign in</Link></p>
  </section>;
}