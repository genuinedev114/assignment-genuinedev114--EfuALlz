import {
  Box,
  Button,
  Chip,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getInvoiceStats, type InvoiceStats } from "../api";
import { FileTypeBadge } from "../components/FileTypeBadge";
import { StatusDonut } from "../components/StatusDonut";
import { UploadButton } from "../components/UploadButton";
import { useInvoices } from "../stream/InvoiceStreamContext";

const STATUS_COLORS: Record<string, string> = {
  uploaded: "#3b82f6",
  processing: "#f59e0b",
  completed: "#22c55e",
  failed: "#ef4444",
};
const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

export function DashboardPage() {
  const { invoices } = useInvoices();
  const [stats, setStats] = useState<InvoiceStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    getInvoiceStats()
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => { /* surfaced via topbar conn pill */ });
    return () => { cancelled = true; };
  }, [invoices.length, invoices.map((i) => i.status).join(",")]);

  const recent = invoices.slice(0, 5);
  const donutData = stats
    ? Object.entries(stats.by_status)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ label: STATUS_LABELS[k] ?? k, value: v, color: STATUS_COLORS[k] ?? "#888" }))
    : [];

  const maxTotal = stats ? Math.max(0, ...Object.values(stats.totals_by_currency)) : 0;

  return (
    <Box className="page-content">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-end" flexWrap="wrap" rowGap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h1" sx={{ fontSize: 26 }}>Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            An overview of your invoices.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button component={Link} to="/invoices/new" variant="outlined">
            Create invoice
          </Button>
          <UploadButton />
        </Stack>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { label: "Total", value: stats?.total ?? 0 },
          { label: "Processing", value: (stats?.by_status.uploaded ?? 0) + (stats?.by_status.processing ?? 0), color: STATUS_COLORS.processing },
          { label: "Completed", value: stats?.by_status.completed ?? 0, color: STATUS_COLORS.completed },
          { label: "Failed", value: stats?.by_status.failed ?? 0, color: STATUS_COLORS.failed },
        ].map((m, i) => (
          <Grid key={m.label} item xs={6} md={3}>
            <Paper
              component={motion.div}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06, ease: [0.2, 0.85, 0.3, 1.05] }}
              whileHover={{ y: -2 }}
              sx={{
                p: 2,
                position: "relative",
                overflow: "hidden",
                cursor: "default",
                transition: "border-color 0.18s, box-shadow 0.18s",
                "&:hover": {
                  boxShadow: "0 12px 30px -16px rgba(15, 23, 42, 0.4)",
                },
              }}
            >
              <Typography variant="h2" sx={{ fontSize: 28, fontVariantNumeric: "tabular-nums", color: m.color }}>
                {m.value}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                {m.label}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h2" sx={{ fontSize: 14, mb: 1 }}>Status breakdown</Typography>
            <Stack direction="row" spacing={3} flexWrap="wrap" alignItems="center" sx={{ mt: 1 }}>
              <StatusDonut data={donutData} />
              <Stack spacing={1} sx={{ flex: 1, minWidth: 140 }}>
                {Object.keys(STATUS_LABELS).map((k) => (
                  <Stack key={k} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ width: 10, height: 10, borderRadius: 0.75, bgcolor: STATUS_COLORS[k] }} />
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                      {STATUS_LABELS[k]}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {stats?.by_status[k] ?? 0}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h2" sx={{ fontSize: 14, mb: 1 }}>Totals by currency</Typography>
            {stats && Object.keys(stats.totals_by_currency).length > 0 ? (
              <Stack spacing={1.5} sx={{ mt: 1 }}>
                {Object.entries(stats.totals_by_currency).map(([currency, total]) => {
                  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                  return (
                    <Box key={currency}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: "0.04em" }}>{currency}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          height: 8,
                          borderRadius: 999,
                          "& .MuiLinearProgress-bar": { bgcolor: "text.primary" },
                        }}
                      />
                    </Box>
                  );
                })}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No completed invoices yet.
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h2" sx={{ fontSize: 14 }}>Recent invoices</Typography>
          <Button component={Link} to="/invoices" size="small" variant="text">View all →</Button>
        </Stack>
        {recent.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No invoices yet. Click <strong>Upload invoice</strong> above to get started.
          </Typography>
        ) : (
          <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
            {recent.map((inv, i) => (
              <Box
                key={inv.id}
                component={motion.div}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.15 + i * 0.04 }}
                whileHover={{ x: 4 }}
              >
              <Stack
                component={Link}
                to={`/invoices/${inv.id}`}
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{
                  py: 1.25,
                  textDecoration: "none",
                  color: "inherit",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FileTypeBadge contentType={inv.content_type} />
                    <Typography sx={{ fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {inv.filename}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}>
                      {inv.id.slice(0, 8)}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {inv.extracted?.vendor_name || "—"}
                    {inv.extracted?.total != null
                      ? ` · ${inv.extracted.currency || ""} ${inv.extracted.total.toFixed(2)}`
                      : ""}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={inv.status}
                  sx={{
                    color: STATUS_COLORS[inv.status],
                    bgcolor: `${STATUS_COLORS[inv.status]}20`,
                    border: `1px solid ${STATUS_COLORS[inv.status]}66`,
                    textTransform: "uppercase",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}
                />
              </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
