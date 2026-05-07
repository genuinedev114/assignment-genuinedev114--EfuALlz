export type InvoiceStatus = "uploaded" | "processing" | "completed" | "failed";

export interface LineItem {
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  amount?: number | null;
}

export interface ExtractedData {
  vendor_name?: string | null;
  vendor_address?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  line_items?: LineItem[];
  notes?: string | null;
}

export interface Invoice {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  status: InvoiceStatus;
  error: string | null;
  attempts: number;
  extracted: ExtractedData | null;
  created_at: string;
  updated_at: string;
}

export type WSEvent =
  | { type: "invoice.created"; invoice: Invoice }
  | { type: "invoice.updated"; invoice: Partial<Invoice> & { id: string } }
  | { type: "invoice.deleted"; id: string };

export interface ChatStep {
  kind: "text" | "tool_use" | "tool_result";
  text?: string | null;
  tool_name?: string | null;
  tool_input?: Record<string, unknown> | null;
  tool_result?: unknown;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  steps?: ChatStep[];
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export interface TokenResult {
  token: string;
  user: AuthUser;
}
