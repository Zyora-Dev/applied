export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type SubmissionKind = "practical" | "homework";
export type SubmissionReview = { id: string; score: number; feedback: string; reviewed_at: string; faculty_name: string };
export type SubmissionReceipt = { id: string; week: number; kind?: SubmissionKind; filename: string; sha256: string; submitted_at: string; size_bytes: number; review?: SubmissionReview | null };
export type SubmissionHistory = { items: SubmissionReceipt[]; total: number; page: number; page_size: number };

export function parseReview(value: unknown): SubmissionReview {
  if (!value || typeof value !== "object") throw new Error("Invalid review");
  const record = value as SubmissionReview;
  if (typeof record.id !== "string" || !UUID_PATTERN.test(record.id) || !Number.isInteger(record.score) || record.score < 0 || record.score > 100
    || typeof record.feedback !== "string" || !record.feedback.trim() || record.feedback.length > 10000
    || typeof record.faculty_name !== "string" || record.faculty_name.length > 500
    || typeof record.reviewed_at !== "string" || !Number.isFinite(Date.parse(record.reviewed_at))) throw new Error("Invalid review");
  return { id: record.id, score: record.score, feedback: record.feedback, reviewed_at: record.reviewed_at, faculty_name: record.faculty_name };
}

export function parseReceipt(value: unknown, week: number): SubmissionReceipt {
  if (!value || typeof value !== "object") throw new Error("Invalid receipt");
  const record = value as SubmissionReceipt;
  if (typeof record.id !== "string" || !UUID_PATTERN.test(record.id) || record.week !== week
    || typeof record.filename !== "string" || record.filename.length > 1024 || !record.filename.toLowerCase().endsWith(".ipynb")
    || typeof record.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.sha256)
    || typeof record.submitted_at !== "string" || !Number.isFinite(Date.parse(record.submitted_at))
    || !Number.isInteger(record.size_bytes) || record.size_bytes <= 0 || record.size_bytes > 2097152) throw new Error("Invalid receipt");
  if (record.kind !== undefined && record.kind !== "practical" && record.kind !== "homework") throw new Error("Invalid receipt");
  return { id: record.id, week, filename: record.filename, sha256: record.sha256, submitted_at: record.submitted_at, size_bytes: record.size_bytes,
    ...(record.kind ? { kind: record.kind } : {}), ...(record.review === undefined ? {} : { review: record.review === null ? null : parseReview(record.review) }) };
}