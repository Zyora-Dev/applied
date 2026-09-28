import { NextRequest } from "next/server";
import { backendRequest, privateJson, sameOrigin, SESSION_COOKIE } from "@/lib/admin-session";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return privateJson({ error: "Request not allowed." }, 403);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const upstream = await backendRequest("/admin/logout", {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (!upstream.ok && upstream.status !== 401) {
        return privateJson({ error: "Could not sign out. Please try again." }, 503);
      }
    } catch {
      return privateJson({ error: "Could not reach the service. Please try again." }, 503);
    }
  }
  const response = privateJson({ success: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0,
  });
  return response;
}