import { useState } from "react";
import { deleteInvoice, retryInvoice } from "../api";
import type { Invoice, InvoiceStatus } from "../types";

interface Props {
  invoices: Invoice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const STATUS_FILTERS: { label: string; value: InvoiceStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Uploaded", value: "uploaded" },
  { label: "Processing", value: "processing" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
];

export function InvoiceList({ invoices, selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState<InvoiceStatus | "all">("all");

  const filtered = filter === "all" ? invoices : invoices.filter((i) => i.status === filter);

  return (
    <div className="card list">
      <div className="list-header">
        <h2>Invoices</h2>
        <div className="filters">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={"chip" + (filter === f.value ? " active" : "")}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 && <div className="muted empty">No invoices.</div>}
      <ul className="invoice-rows">
        {filtered.map((inv) => (
          <Row
            key={inv.id}
            invoice={inv}
            selected={inv.id === selectedId}
            onSelect={() => onSelect(inv.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function Row({ invoice, selected, onSelect }: { invoice: Invoice; selected: boolean; onSelect: () => void }) {
  const [busy, setBusy] = useState(false);
  const total = invoice.extracted?.total;
  const currency = invoice.extracted?.currency || "";
  const vendor = invoice.extracted?.vendor_name;

  async function handleRetry(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      await retryInvoice(invoice.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete ${invoice.filename}?`)) return;
    setBusy(true);
    try {
      await deleteInvoice(invoice.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={"row" + (selected ? " selected" : "")} onClick={onSelect}>
      <div className="row-main">
        <div className="row-name">
          <strong>{invoice.filename}</strong>
          <span className="row-id muted">{invoice.id.slice(0, 8)}</span>
        </div>
        <div className="row-meta muted">
          {vendor || "—"}{total != null ? ` · ${currency} ${total.toFixed(2)}` : ""}
        </div>
      </div>
      <div className="row-side">
        <StatusBadge status={invoice.status} />
        {invoice.status === "failed" && (
          <button className="btn small" onClick={handleRetry} disabled={busy}>
            Retry
          </button>
        )}
        <button className="btn small ghost" onClick={handleDelete} disabled={busy} title="Delete">
          ×
        </button>
      </div>
    </li>
  );
}

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`status status-${status}`}>{status}</span>;
}
