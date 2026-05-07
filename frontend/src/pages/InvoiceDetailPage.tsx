import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteInvoice, getInvoice, retryInvoice, updateInvoice, formatError } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FilePreview } from "../components/FilePreview";
import { useNotifications } from "../notifications/NotificationsContext";
import { useInvoices } from "../stream/InvoiceStreamContext";
import type { ExtractedData, Invoice } from "../types";

const STATUS_COLORS: Record<string, string> = {
  uploaded: "#3b82f6",
  processing: "#f59e0b",
  completed: "#22c55e",
  failed: "#ef4444",
};

export function InvoiceDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { invoices } = useInvoices();
  const { push } = useNotifications();

  const live = invoices.find((i) => i.id === id) ?? null;
  const [fetched, setFetched] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExtractedData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [view, setView] = useState<"data" | "preview">("data");
  const invoice = live ?? fetched;

  useEffect(() => {
    if (live || !id) return;
    let cancelled = false;
    getInvoice(id)
      .then((inv) => { if (!cancelled) setFetched(inv); })
      .catch((e) => { if (!cancelled) setError(formatError(e)); });
    return () => { cancelled = true; };
  }, [id, live]);

  function startEdit() {
    if (!invoice?.extracted) return;
    setDraft(JSON.parse(JSON.stringify(invoice.extracted)));
    setEditing(true);
  }

  async function saveEdit() {
    if (!invoice || !draft) return;
    setBusy(true);
    try {
      await updateInvoice(invoice.id, draft as Record<string, unknown>);
      push({ kind: "success", title: "Saved", body: "Invoice updated." });
      setEditing(false);
      setDraft(null);
    } catch (e) {
      push({ kind: "error", title: "Save failed", body: formatError(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    if (!invoice) return;
    setBusy(true);
    try { await retryInvoice(invoice.id); } finally { setBusy(false); }
  }

  async function performDelete() {
    if (!invoice) return;
    setBusy(true);
    try {
      await deleteInvoice(invoice.id);
      push({ kind: "success", title: "Invoice deleted", body: invoice.filename });
      navigate("/invoices", { replace: true });
    } catch (e) {
      push({ kind: "error", title: "Delete failed", body: formatError(e) });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (error) {
    return (
      <Box className="page-content">
        <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h1" sx={{ fontSize: 24 }}>Invoice not found</Typography>
            <Typography variant="body2" color="text.secondary">{error}</Typography>
          </Box>
          <Button component={Link} to="/invoices" variant="outlined">← Back to invoices</Button>
        </Stack>
      </Box>
    );
  }
  if (!invoice) {
    return <Box className="page-content"><Typography color="text.secondary">Loading…</Typography></Box>;
  }

  const ex = editing ? draft : invoice.extracted;

  return (
    <Box className="page-content">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-end" flexWrap="wrap" rowGap={1} sx={{ mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Button component={Link} to="/invoices" size="small" variant="text" sx={{ mb: 0.5 }}>
            ← Back to invoices
          </Button>
          <Typography variant="h1" sx={{ fontSize: 26, wordBreak: "break-word" }}>{invoice.filename}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}>
            {invoice.id} · uploaded {new Date(invoice.created_at).toLocaleString()} · attempts: {invoice.attempts}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            size="small"
            label={invoice.status}
            sx={{
              color: STATUS_COLORS[invoice.status],
              bgcolor: `${STATUS_COLORS[invoice.status]}20`,
              border: `1px solid ${STATUS_COLORS[invoice.status]}66`,
              textTransform: "uppercase",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          />
          {invoice.status === "failed" && (
            <Button onClick={handleRetry} disabled={busy} variant="contained" color="primary">
              Retry
            </Button>
          )}
          <Button onClick={() => setConfirmDelete(true)} disabled={busy} variant="outlined" color="error">
            Delete
          </Button>
        </Stack>
      </Stack>

      {invoice.status === "failed" && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <strong>Failed:</strong> {invoice.error || "unknown error"}
        </Alert>
      )}
      {invoice.status === "processing" && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography color="text.secondary">Extracting invoice data…</Typography>
        </Paper>
      )}

      {ex && invoice.status === "completed" ? (
        <>
          {/* Toggle between extracted data and the PDF/image preview. Only one
              shows at a time so each gets the full content width. */}
          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1.5 }}>
            <ToggleButtonGroup
              value={view}
              exclusive
              onChange={(_e, v) => v && setView(v)}
              size="small"
            >
              <ToggleButton value="data">Extracted data</ToggleButton>
              <ToggleButton value="preview">Preview</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {view === "data" ? (
            <>
              <Paper sx={{ p: 3, mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h2" sx={{ fontSize: 14 }}>Extracted data</Typography>
                  {editing ? (
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={() => { setEditing(false); setDraft(null); }} disabled={busy}>
                        Cancel
                      </Button>
                      <Button size="small" variant="contained" color="primary" onClick={saveEdit} disabled={busy}>
                        {busy ? "Saving…" : "Save changes"}
                      </Button>
                    </Stack>
                  ) : (
                    <Button size="small" variant="outlined" onClick={startEdit}>Edit</Button>
                  )}
                </Stack>
                {editing && draft ? (
                  <EditableGrid draft={draft} onChange={setDraft} />
                ) : (
                  <Grid container spacing={1.5}>
                    <KV label="Vendor" value={ex.vendor_name} />
                    <KV label="Vendor address" value={ex.vendor_address} />
                    <KV label="Invoice #" value={ex.invoice_number} />
                    <KV label="Invoice date" value={ex.invoice_date} />
                    <KV label="Due date" value={ex.due_date} />
                    <KV label="Currency" value={ex.currency} />
                    <KV label="Subtotal" value={fmtNum(ex.subtotal)} />
                    <KV label="Tax" value={fmtNum(ex.tax)} />
                    <KV label="Total" value={fmtNum(ex.total)} highlight />
                  </Grid>
                )}
              </Paper>

              {ex.line_items && ex.line_items.length > 0 && !editing && (
                <Paper sx={{ p: 3, mb: 2 }}>
                  <Typography variant="h2" sx={{ fontSize: 14, mb: 1 }}>Line items</Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Description</TableCell>
                        <TableCell>Qty</TableCell>
                        <TableCell>Unit</TableCell>
                        <TableCell>Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {ex.line_items.map((li, i) => (
                        <TableRow key={i}>
                          <TableCell>{li.description}</TableCell>
                          <TableCell>{fmtNum(li.quantity)}</TableCell>
                          <TableCell>{fmtNum(li.unit_price)}</TableCell>
                          <TableCell>{fmtNum(li.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {ex.notes && <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>Notes: {ex.notes}</Typography>}
                </Paper>
              )}
            </>
          ) : (
            <Paper
              sx={{
                p: 3,
                // Fill almost the whole viewport below the topbar + page header,
                // so the PDF gets the room it needs to read clearly.
                height: "calc(100vh - 220px)",
                minHeight: 600,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h2" sx={{ fontSize: 14 }}>Preview</Typography>
                <Typography variant="caption" color="text.secondary">{invoice.filename}</Typography>
              </Stack>
              <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <FilePreview
                  invoiceId={invoice.id}
                  contentType={invoice.content_type}
                  filename={invoice.filename}
                  height="100%"
                />
              </Box>
            </Paper>
          )}
        </>
      ) : (
        // Not yet completed (or extraction missing) — preview alone, full width.
        <Paper
          sx={{
            p: 3,
            height: "calc(100vh - 220px)",
            minHeight: 600,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h2" sx={{ fontSize: 14 }}>Preview</Typography>
            <Typography variant="caption" color="text.secondary">{invoice.filename}</Typography>
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <FilePreview
              invoiceId={invoice.id}
              contentType={invoice.content_type}
              filename={invoice.filename}
              height="100%"
            />
          </Box>
        </Paper>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete invoice?"
        description={`"${invoice.filename}" will be permanently removed from your account, along with its extracted data. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={performDelete}
      />
    </Box>
  );
}

function EditableGrid({ draft, onChange }: { draft: ExtractedData; onChange: (d: ExtractedData) => void }) {
  function set<K extends keyof ExtractedData>(key: K, value: ExtractedData[K]) {
    onChange({ ...draft, [key]: value });
  }
  function setNum<K extends keyof ExtractedData>(key: K, raw: string) {
    if (raw === "") { set(key, null as ExtractedData[K]); return; }
    const n = Number(raw);
    if (Number.isFinite(n)) set(key, n as ExtractedData[K]);
  }
  return (
    <Grid container spacing={1.5}>
      <EditCell label="Vendor"          value={draft.vendor_name}     onChange={(v) => set("vendor_name", v || null)} />
      <EditCell label="Vendor address"  value={draft.vendor_address}  onChange={(v) => set("vendor_address", v || null)} />
      <EditCell label="Invoice #"       value={draft.invoice_number}  onChange={(v) => set("invoice_number", v || null)} />
      <EditCell label="Invoice date"    value={draft.invoice_date}    onChange={(v) => set("invoice_date", v || null)} />
      <EditCell label="Due date"        value={draft.due_date}        onChange={(v) => set("due_date", v || null)} />
      <EditCell label="Currency"        value={draft.currency}        onChange={(v) => set("currency", v || null)} />
      <EditCell label="Subtotal"        type="number" value={draft.subtotal} onChange={(v) => setNum("subtotal", v)} />
      <EditCell label="Tax"             type="number" value={draft.tax}      onChange={(v) => setNum("tax", v)} />
      <EditCell label="Total"           type="number" value={draft.total}    onChange={(v) => setNum("total", v)} highlight />
    </Grid>
  );
}

function EditCell({
  label,
  value,
  onChange,
  type = "text",
  highlight,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: "text" | "number";
  highlight?: boolean;
}) {
  const display = value == null ? "" : String(value);
  return (
    <Grid item xs={12} sm={6} md={4}>
      <TextField
        label={label}
        type={type}
        value={display}
        onChange={(e) => onChange(e.target.value)}
        size="small"
        fullWidth
        inputProps={{ step: type === "number" ? "0.01" : undefined }}
        sx={highlight ? { "& .MuiOutlinedInput-root": { backgroundColor: "action.hover", fontWeight: 700 } } : undefined}
      />
    </Grid>
  );
}

function KV({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  return (
    <Grid item xs={12} sm={6} md={4}>
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          ...(highlight && {
            backgroundColor: (theme: import("@mui/material").Theme) =>
              theme.palette.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(15,12,8,0.04)",
            borderColor: (theme: import("@mui/material").Theme) =>
              theme.palette.mode === "dark" ? "rgba(255,255,255,0.18)" : "rgba(15,12,8,0.18)",
          }),
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, fontSize: 10 }}>
          {label}
        </Typography>
        <Typography sx={{ fontWeight: 550, fontSize: 14 }}>
          {value ?? <span style={{ color: "var(--mui-palette-text-secondary, #888)" }}>—</span>}
        </Typography>
      </Paper>
    </Grid>
  );
}

function fmtNum(n: number | null | undefined): string | null {
  if (n == null) return null;
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
