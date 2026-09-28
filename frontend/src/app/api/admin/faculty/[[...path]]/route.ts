import { recordsProxy } from "@/lib/admin-records-proxy";

export const GET = recordsProxy("faculty");
export const POST = GET;
export const PUT = GET;