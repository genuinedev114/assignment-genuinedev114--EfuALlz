import { retryInvoice } from "../api";
import type { Invoice } from "../types";
import { StatusBadge } from "./InvoiceList";

export function InvoiceDetail({ invoice }: { invoice: Invoice | null }) {
  if (!invoice) {
    return (
      <div className="card detail">
        <h2>Details</h2>
        <p className="muted">Select an invoice to see its details.</p>
      </div>
    );
  }
  const ex = invoice.extracted;
  return (
    <div className="card detail">
      <div className="detail-header">
        <h2>{invoice.filename}</h2>
        <StatusBadge status={invoice.status} />
      </div>
      <div className="muted small">
        {invoice.id} · uploaded {new Date(invoice.created_at).toLocaleString()} ·
        attempts: {invoice.attempts}
      </div>

      {invoice.status === "failed" && (
        <div className="error">
          <strong>Failed:</strong> {invoice.error || "unknown error"}
          <button className="btn small" style={{ marginLeft: 8 }} onClick={() => retryInvoice(invoice.id)}>
            Retry
          </button>
        </div>
      )}

      {invoice.status === "processing" && <div className="muted">Extracting invoice data…</div>}

      {ex && invoice.status === "completed" && (
        <>
          <div className="kv-grid">
            <KV label="Vendor" value={ex.vendor_name} />
            <KV label="Vendor address" value={ex.vendor_address} />
            <KV label="Invoice #" value={ex.invoice_number} />
            <KV label="Invoice date" value={ex.invoice_date} />
            <KV label="Due date" value={ex.due_date} />
            <KV label="Currency" value={ex.currency} />
            <KV label="Subtotal" value={fmtNum(ex.subtotal)} />
            <KV label="Tax" value={fmtNum(ex.tax)} />
            <KV label="Total" value={fmtNum(ex.total)} highlight />
          </div>
          {ex.line_items && ex.line_items.length > 0 && (
            <>
              <h3>Line items</h3>
              <table className="line-items">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ex.line_items.map((li, i) => (
                    <tr key={i}>
                      <td>{li.description}</td>
                      <td>{fmtNum(li.quantity)}</td>
                      <td>{fmtNum(li.unit_price)}</td>
                      <td>{fmtNum(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {ex.notes && <div className="muted small">Notes: {ex.notes}</div>}
        </>
      )}

      <details className="raw">
        <summary>Original file</summary>
        <a href={`/api/invoices/${invoice.id}/file`} target="_blank" rel="noreferrer">
          Open {invoice.filename}
        </a>
      </details>
    </div>
  );
}

function KV({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  return (
    <div className={"kv" + (highlight ? " highlight" : "")}>
      <div className="kv-label">{label}</div>
      <div className="kv-value">{value ?? <span className="muted">—</span>}</div>
    </div>
  );
}

function fmtNum(n: number | null | undefined): string | null {
  if (n == null) return null;
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
