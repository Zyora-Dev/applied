"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CreatedAccount = { id: number; email_delivery: "accepted" | "failed" | "not_configured" };

export function AccountCreated({ account, resource }: { account: CreatedAccount; resource: "students" | "faculty" }) {
  const router = useRouter();
  const message = account.email_delivery === "accepted"
    ? "Credentials email submitted successfully to ZeptoMail."
    : account.email_delivery === "not_configured"
      ? "Email settings are not configured. The credentials email was not sent."
      : "Email submission could not be confirmed. The account is saved; do not create it again.";
  return <section role="status" className="space-y-5">
    <h1 className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="size-5 shrink-0 text-primary" />{resource === "students" ? "Student" : "Faculty"} account created</h1>
    <p className="flex items-start gap-2 text-sm text-foreground"><Mail className="mt-0.5 size-4 shrink-0" />{message}</p>
    <Button className="h-9" onClick={() => router.push(`/admin/${resource}/${account.id}`)}>View profile<ArrowRight className="size-4" /></Button>
  </section>;
}