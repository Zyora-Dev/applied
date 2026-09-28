import { recordsProxy } from "@/lib/admin-records-proxy";

export const GET = recordsProxy("students");
export const POST = GET;
export const PUT = GET;
export const DELETE = GET;