import type { NextConfig } from "next";
import { PHASE_PRODUCTION_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_SERVER) {
    const origin = process.env.APP_ORIGIN;
    try {
      const parsed = new URL(origin || "");
      if (parsed.protocol !== "https:" || parsed.origin !== origin || parsed.username || parsed.password) {
        throw new Error();
      }
    } catch {
      throw new Error("APP_ORIGIN must be the public HTTPS origin without a trailing slash or path.");
    }
    try {
      const backend = new URL(process.env.API_BASE_URL || "");
      if (!["http:", "https:"].includes(backend.protocol) || backend.username || backend.password ||
          backend.pathname !== "/" || backend.search || backend.hash) {
        throw new Error();
      }
    } catch {
      throw new Error("API_BASE_URL must be the private backend HTTP(S) origin.");
    }
  }
  return {};
}
