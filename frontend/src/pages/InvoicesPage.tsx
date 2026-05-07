import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VisibilityIcon from "@mui/icons-material/Visibility";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  bulkDelete,
  bulkRetry,
  deleteInvoice,
  downloadCsv,
  formatError,
  retryInvoice,
} from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FilePreview } from "../components/FilePreview";
import { FileTypeBadge } from "../components/FileTypeBadge";
import { UploadButton } from "../components/UploadButton";
import { useNotifications } from "../notifications/NotificationsContext";
import { useInvoices } from "../stream/InvoiceStreamContext";
import type { Invoice, InvoiceStatus } from "../types";

const STATUS_COLORS: Record<string, string> = {
  uploaded: "#3b82f6",
  processing: "#f59e0b",
  completed: "#22c55e",
  failed: "#ef4444",
};

const FILTERS: { label: string; value: InvoiceStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Uploaded", value: "uploaded" },
  { label: "Processing", value: "processing" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
];

type SortKey = "newest" | "oldest" | "amount-desc" | "amount-asc" | "vendor";

const SORTS: { label: string; value: SortKey }[] = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Amount (high → low)", value: "amount-desc" },
  { label: "Amount (low → high)", value: "amount-asc" },
  { label: "Vendor (A → Z)", value: "vendor" },
];

export function InvoicesPage() {
  const { invoices } = useInvoices();
  const { push } = useNotifications();
  const [filter, setFilter] = useState<InvoiceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "single"; invoice: Invoice } | { kind: "bulk"; ids: string[] } | null>(null);
  const [preview, setPreview] = useState<Invoice | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices
      .filter((i) => filter === "all" || i.status === filter)
      .filter((i) => {
        if (!q) return true;
        return (
          i.filename.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q) ||
          (i.extracted?.vendor_name ?? "").toLowerCase().includes(q)
        );
      })
      .sort(makeComparator(sort));
  }, [invoices, filter, search, sort]);

  const visibleIds = new Set(filtered.map((i) => i.id));
  const visibleSelected = new Set([...selected].filter((id) => visibleIds.has(id)));
  const allVisibleSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((s) => {
      const next = new Set(s);
      if (allVisibleSelected) for (const i of filtered) next.delete(i.id);
      else for (const i of filtered) next.add(i.id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function performBulkDelete(ids: string[]) {
    setBusy(true);
    try {
      const res = await bulkDelete(ids);
      push({
        kind: "success",
        title: `${res.succeeded.length} deleted`,
        body: Object.keys(res.failed).length > 0
          ? `${Object.keys(res.failed).length} failed.`
          : undefined,
      });
      clearSelection();
    } catch (e) {
      push({ kind: "error", title: "Bulk delete failed", body: formatError(e) });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function performSingleDelete(invoice: Invoice) {
    setBusy(true);
    try {
      await deleteInvoice(invoice.id);
      push({ kind: "success", title: "Invoice deleted", body: invoice.filename });
    } catch (e) {
      push({ kind: "error", title: "Delete failed", body: formatError(e) });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function handleBulkRetry() {
    const ids = [...visibleSelected];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const res = await bulkRetry(ids);
      push({
        kind: "success",
        title: `${res.succeeded.length} re-queued`,
        body: Object.keys(res.failed).length > 0
          ? `${Object.keys(res.failed).length} skipped (only failed invoices can be retried).`
          : undefined,
      });
      clearSelection();
    } catch (e) {
      push({ kind: "error", title: "Bulk retry failed", body: formatError(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    try {
      await downloadCsv();
      push({ kind: "success", title: "CSV exported", body: "Saved as invoices.csv" });
    } catch (e) {
      push({ kind: "error", title: "Export failed", body: formatError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box className="page-content">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-end" flexWrap="wrap" rowGap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h1" sx={{ fontSize: 26 }}>Invoices</Typography>
          <Typography variant="body2" color="text.secondary">
            {invoices.length} total · {filtered.length} shown
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={handleExport} disabled={busy || invoices.length === 0} variant="outlined">
            Export CSV
          </Button>
          <Button component={Link} to="/invoices/new" variant="outlined">
            Create
          </Button>
          <UploadButton label="Upload" />
        </Stack>
      </Stack>

      <Paper sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" rowGap={1} sx={{ mb: 2 }}>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" rowGap={1}>
            {FILTERS.map((f) => (
              <Chip
                key={f.value}
                label={f.label}
                size="small"
                clickable
                color={filter === f.value ? "primary" : "default"}
                variant={filter === f.value ? "filled" : "outlined"}
                onClick={() => setFilter(f.value)}
              />
            ))}
          </Stack>
          <TextField
            size="small"
            placeholder="Search filename, vendor, id… (press / to focus)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputProps={{ "data-search-input": true }}
            sx={{ flex: 1, minWidth: 220 }}
          />
          <TextField
            size="small"
            select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            sx={{ minWidth: 180 }}
          >
            {SORTS.map((s) => (
              <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
            ))}
          </TextField>
        </Stack>

        {filtered.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No invoices match.</Typography>
        ) : (
          <>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: 1, mb: 1 }}>
              <Checkbox size="small" checked={allVisibleSelected} onChange={toggleAllVisible} />
              <Typography variant="caption" color="text.secondary">Select all visible</Typography>
            </Stack>
            {/* Stagger rows on first paint and on filter changes; AnimatePresence
                handles smooth removal when an invoice is deleted from the stream. */}
            <Box>
              <AnimatePresence initial={false}>
                {filtered.map((inv, idx) => (
                  <motion.div
                    key={inv.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: Math.min(idx * 0.025, 0.3) } }}
                    exit={{ opacity: 0, x: -16, transition: { duration: 0.18 } }}
                    transition={{ duration: 0.28, ease: [0.2, 0.85, 0.3, 1.05] }}
                    style={{ borderTop: idx === 0 ? "none" : "1px solid var(--mui-palette-divider)" }}
                  >
                    <Row
                      invoice={inv}
                      selected={selected.has(inv.id)}
                      onToggle={() => toggle(inv.id)}
                      onAskDelete={() => setConfirm({ kind: "single", invoice: inv })}
                      onPreview={() => setPreview(inv)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </Box>
          </>
        )}
      </Paper>

      {visibleSelected.size > 0 && (
        <Paper
          elevation={6}
          sx={{
            position: "sticky",
            bottom: 12,
            mt: 2,
            p: 1.5,
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Typography variant="body2">
            <strong>{visibleSelected.size}</strong> selected
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={clearSelection}>Clear</Button>
            <Button size="small" variant="outlined" onClick={handleBulkRetry} disabled={busy}>
              Retry failed
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => setConfirm({ kind: "bulk", ids: [...visibleSelected] })}
              disabled={busy}
            >
              Delete
            </Button>
          </Stack>
        </Paper>
      )}

      <ConfirmDialog
        open={confirm?.kind === "single"}
        title="Delete invoice?"
        description={
          confirm?.kind === "single"
            ? `"${confirm.invoice.filename}" will be permanently removed from your account, along with its extracted data. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === "single" && performSingleDelete(confirm.invoice)}
      />

      <ConfirmDialog
        open={confirm?.kind === "bulk"}
        title={confirm?.kind === "bulk" ? `Delete ${confirm.ids.length} invoice${confirm.ids.length === 1 ? "" : "s"}?` : ""}
        description="The selected invoices and their extracted data will be permanently removed. This cannot be undone."
        confirmLabel="Delete all"
        destructive
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === "bulk" && performBulkDelete(confirm.ids)}
      />

      <Dialog
        open={preview !== null}
        onClose={() => setPreview(null)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { height: "90vh" } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {preview?.filename ?? ""}
          </Box>
          <IconButton onClick={() => setPreview(null)} size="small" aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, display: "flex", flexDirection: "column" }}>
          {preview && (
            <Box sx={{ flex: 1, p: 2, display: "flex", flexDirection: "column" }}>
              <FilePreview
                invoiceId={preview.id}
                contentType={preview.content_type}
                filename={preview.filename}
                height="100%"
                hideActions={false}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

function Row({
  invoice,
  selected,
  onToggle,
  onAskDelete,
  onPreview,
}: {
  invoice: Invoice;
  selected: boolean;
  onToggle: () => void;
  onAskDelete: () => void;
  onPreview: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleRetry(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try { await retryInvoice(invoice.id); } finally { setBusy(false); }
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      sx={{
        px: 1,
        py: 1,
        borderRadius: 1,
        ...(selected && { bgcolor: "action.selected" }),
      }}
    >
      <Box onClick={(e) => e.stopPropagation()} sx={{ pr: 1 }}>
        <Checkbox size="small" checked={selected} onChange={onToggle} />
      </Box>
      <Box
        component={Link}
        to={`/invoices/${invoice.id}`}
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          textDecoration: "none",
          color: "inherit",
          minWidth: 0,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <FileTypeBadge contentType={invoice.content_type} />
            <Typography sx={{ fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {invoice.filename}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}>
              {invoice.id.slice(0, 8)}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {invoice.extracted?.vendor_name || "—"}
            {invoice.extracted?.total != null
              ? ` · ${invoice.extracted.currency || ""} ${invoice.extracted.total.toFixed(2)}`
              : ""}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 1 }}>
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
            <Button size="small" variant="outlined" onClick={handleRetry} disabled={busy}>
              Retry
            </Button>
          )}
          <Tooltip title="Quick preview">
            <IconButton
              size="small"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreview(); }}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton
              size="small"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAskDelete(); }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </Stack>
  );
}

function makeComparator(sort: SortKey): (a: Invoice, b: Invoice) => number {
  switch (sort) {
    case "oldest":
      return (a, b) => a.created_at.localeCompare(b.created_at);
    case "amount-desc":
      return (a, b) => (b.extracted?.total ?? -Infinity) - (a.extracted?.total ?? -Infinity);
    case "amount-asc":
      return (a, b) => (a.extracted?.total ?? Infinity) - (b.extracted?.total ?? Infinity);
    case "vendor":
      return (a, b) => (a.extracted?.vendor_name ?? "").localeCompare(b.extracted?.vendor_name ?? "");
    case "newest":
    default:
      return (a, b) => b.created_at.localeCompare(a.created_at);
  }
}
