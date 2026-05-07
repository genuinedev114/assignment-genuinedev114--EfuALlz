import type {
  AuthUser,
  ChatStep,
  ChatTurn,
  Invoice,
  TokenResult,
} from "./types";

const TOKEN_KEY = "invoice.auth.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * Track invoice IDs that this client just uploaded so the WebSocket stream
 * doesn't fire a duplicate "Invoice uploaded" toast on top of the local
 * "Uploaded" toast. Each ID is consumed once: if the WS event arrives later
 * than expected, only the first observation suppresses the toast.
 */
const recentlyUploaded = new Set<string>();
export function markSelfUploaded(id: string): void {
  recentlyUploaded.add(id);
}
export function consumeSelfUploaded(id: string): boolean {
  if (recentlyUploaded.has(id)) {
    recentlyUploaded.delete(id);
    return true;
  }
  return false;
}

/**
 * Pull a human-readable message out of any error thrown by fetch/jsonOrThrow.
 * Use everywhere we'd otherwise inline `String(e instanceof Error ? e.message : e)`.
 */
export function formatError(e: unknown): string {
  if (e instanceof Error) {
    // TypeError on a fetch usually means CORS, DNS, or network down.
    if (e.name === "TypeError" && e.message.toLowerCase().includes("fetch")) {
      return "Network error — couldn't reach the server.";
    }
    return e.message || "Something went wrong.";
  }
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) {
        // Pydantic validation errors come back as a list of {loc, msg, ...}.
        if (Array.isArray(body.detail)) {
          message = body.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ");
        } else {
          message = String(body.detail);
        }
      }
    } catch {
      // fallthrough — keep generic message
    }
    throw new Error(message);
  }
  return res.json();
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// --- auth ---

export async function register(
  username: string,
  email: string,
  password: string,
  passwordConfirm: string,
): Promise<TokenResult> {
  return jsonOrThrow(
    await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username,
        email,
        password,
        password_confirm: passwordConfirm,
      }),
    }),
  );
}

export async function login(identifier: string, password: string): Promise<TokenResult> {
  return jsonOrThrow(
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    }),
  );
}

export async function me(): Promise<AuthUser> {
  return jsonOrThrow(await fetch("/api/auth/me", { headers: authHeaders() }));
}

// --- invoices ---

export async function listInvoices(opts: { status?: string; limit?: number } = {}): Promise<Invoice[]> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString() ? `?${params}` : "";
  return jsonOrThrow(await fetch(`/api/invoices${qs}`, { headers: authHeaders() }));
}

export async function getInvoice(id: string): Promise<Invoice> {
  return jsonOrThrow(await fetch(`/api/invoices/${id}`, { headers: authHeaders() }));
}

export interface InvoiceStats {
  total: number;
  by_status: Record<string, number>;
  totals_by_currency: Record<string, number>;
}

export async function getInvoiceStats(): Promise<InvoiceStats> {
  return jsonOrThrow(await fetch("/api/invoices/stats", { headers: authHeaders() }));
}

export class UploadError extends Error {
  /** Stable code: "duplicate" | "unsupported" | "too_large" | "empty" | "auth" | "unknown" */
  code: string;
  /** For duplicates, the id of the invoice already on file. */
  existingId?: string;
  status: number;
  constructor(message: string, code: string, status: number, existingId?: string) {
    super(message);
    this.name = "UploadError";
    this.code = code;
    this.status = status;
    this.existingId = existingId;
  }
}

/**
 * Translate the backend's HTTP responses into friendly, user-facing messages
 * before they bubble up to the toast system. Keeps callers free of HTTP
 * status branching.
 */
export async function uploadInvoice(file: File): Promise<Invoice> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/invoices", { method: "POST", body: fd, headers: authHeaders() });
  if (res.ok) return res.json();

  let body: { detail?: unknown } | null = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const detail = body?.detail;

  if (res.status === 409 && detail && typeof detail === "object" && (detail as { code?: string }).code === "duplicate") {
    const d = detail as { code: string; message?: string; existing_id?: string };
    throw new UploadError(
      "This file has already been uploaded.",
      "duplicate",
      409,
      d.existing_id,
    );
  }
  if (res.status === 415) {
    throw new UploadError(
      "That file type isn't supported. Please upload a PDF, PNG, JPG, or WebP.",
      "unsupported",
      415,
    );
  }
  if (res.status === 413) {
    throw new UploadError(
      "That file is too large. The maximum size is 15 MB.",
      "too_large",
      413,
    );
  }
  if (res.status === 400) {
    throw new UploadError(
      typeof detail === "string" ? detail : "The file couldn't be processed. Please try a different file.",
      "empty",
      400,
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new UploadError(
      "You're not signed in. Please sign in and try again.",
      "auth",
      res.status,
    );
  }
  throw new UploadError(
    typeof detail === "string" && detail
      ? detail
      : "Couldn't upload the file. Please try again.",
    "unknown",
    res.status,
  );
}

export async function retryInvoice(id: string): Promise<Invoice> {
  return jsonOrThrow(
    await fetch(`/api/invoices/${id}/retry`, { method: "POST", headers: authHeaders() }),
  );
}

export async function deleteInvoice(id: string): Promise<void> {
  const res = await fetch(`/api/invoices/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
}

export interface InvoicePartyInput {
  name: string;
  email?: string;
  address?: string;
  city?: string;
  phone?: string;
  tax_id?: string;
}

export interface InvoiceLineItemInput {
  description: string;
  details?: string;
  rate: number;
  quantity: number;
}

export interface InvoiceGenerateInput {
  title?: string;
  number?: string;
  date?: string;
  due_date?: string;
  terms?: string;
  sender: InvoicePartyInput;
  recipient: InvoicePartyInput;
  items: InvoiceLineItemInput[];
  currency?: string;
  tax_rate?: number;
  tax_label?: string;
  tax_type?: "on_total" | "per_item";
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  theme?: "modern" | "traditional";
  logo_data_url?: string;
  signature_data_url?: string;
  footer_image_data_url?: string;
  notes?: string;
}

export async function generateInvoice(input: InvoiceGenerateInput): Promise<Invoice> {
  return jsonOrThrow(
    await fetch("/api/invoices/generate", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateInvoice(id: string, extracted: Record<string, unknown>): Promise<Invoice> {
  return jsonOrThrow(
    await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ extracted }),
    }),
  );
}

export interface BulkResult {
  succeeded: string[];
  failed: Record<string, string>;
}

export async function bulkDelete(ids: string[]): Promise<BulkResult> {
  return jsonOrThrow(
    await fetch("/api/invoices/bulk_delete", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ids }),
    }),
  );
}

export async function bulkRetry(ids: string[]): Promise<BulkResult> {
  return jsonOrThrow(
    await fetch("/api/invoices/bulk_retry", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ids }),
    }),
  );
}

export function exportCsvUrl(): string {
  // The browser will use cookies-or-headers for auth; we attach the token as a query
  // param fallback since `<a download>` can't set headers. We'll instead trigger a
  // fetch + blob download in the UI to keep auth via Authorization header.
  return "/api/invoices/export.csv";
}

export async function downloadCsv(): Promise<void> {
  const res = await fetch("/api/invoices/export.csv", { headers: authHeaders() });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "invoices.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  newPasswordConfirm: string,
): Promise<void> {
  const res = await fetch("/api/auth/password", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm,
    }),
  });
  if (!res.ok && res.status !== 204) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) {
        msg = Array.isArray(body.detail)
          ? body.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ")
          : String(body.detail);
      }
    } catch {
      /* fallthrough */
    }
    throw new Error(msg);
  }
}

export async function chat(messages: ChatTurn[]): Promise<{ steps: ChatStep[]; reply: string }> {
  return jsonOrThrow(
    await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        messages: messages.map(({ role, content }) => ({ role, content })),
      }),
    }),
  );
}
