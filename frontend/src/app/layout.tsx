import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Admin sign in | Applied AI",
  description: "Applied AI course administration at Arunachala.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning><TooltipProvider delayDuration={250}>{children}</TooltipProvider></body>
    </html>
  );
}
