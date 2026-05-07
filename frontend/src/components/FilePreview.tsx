import DownloadIcon from "@mui/icons-material/Download";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Tooltip,
} from "@mui/material";
import { useEffect, useState } from "react";
import { getToken, formatError } from "../api";

interface Props {
  invoiceId: string;
  contentType: string;
  filename: string;
  /** CSS height for the wrapper. Pass a number (px) or any valid CSS length / "100%". */
  height?: number | string;
  /** Hide the action bar (download/open). Useful inside dialogs that have their own chrome. */
  hideActions?: boolean;
}

/**
 * Inline preview for an invoice file. Fetches `/api/invoices/:id/file` with the
 * stored bearer token (since `<iframe>` can't set headers) and points the frame
 * at the resulting blob URL. Cleans up object URLs on unmount.
 *
 * The wrapper is flex-column so the iframe always fills whatever vertical space
 * is left after the action bar — no awkward empty zones inside dialogs.
 */
export function FilePreview({ invoiceId, contentType, filename, height = 720, hideActions }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);
    setBlobUrl(null);

    const token = getToken();
    fetch(`/api/invoices/${invoiceId}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      })
      .catch((e) => {
        if (!cancelled) setError(formatError(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [invoiceId]);

  function download() {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function openInNewTab() {
    if (!blobUrl) return;
    window.open(blobUrl, "_blank", "noopener,noreferrer");
  }

  const isPdf = contentType === "application/pdf";
  const isImage = contentType.startsWith("image/");

  // `#view=FitH` (fit horizontally) makes the page fill the iframe width — the
  // most readable default for a wide preview. The PDF viewer scrolls vertically
  // if the page is taller than the iframe, and `Fit` is left for callers that
  // explicitly want the whole page visible (passed via `fit="page"`).
  const iframeSrc = blobUrl && isPdf ? `${blobUrl}#view=FitH&toolbar=1` : blobUrl ?? "";

  return (
    <Box sx={{ height, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {!hideActions && (
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mb: 1, flexShrink: 0 }}>
          <Tooltip title="Open in new tab">
            <span>
              <Button
                size="small"
                startIcon={<OpenInNewIcon fontSize="small" />}
                disabled={!blobUrl}
                onClick={openInNewTab}
              >
                Open
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Download">
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon fontSize="small" />}
                disabled={!blobUrl}
                onClick={download}
              >
                Download
              </Button>
            </span>
          </Tooltip>
        </Stack>
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: "background.default",
          display: "grid",
          placeItems: "center",
        }}
      >
        {loading && <CircularProgress size={32} />}
        {error && !loading && (
          <Alert severity="error" sx={{ m: 2 }}>
            Couldn't load preview: {error}
          </Alert>
        )}
        {!loading && !error && blobUrl && isPdf && (
          <iframe
            src={iframeSrc}
            title={filename}
            style={{ width: "100%", height: "100%", border: 0, display: "block" }}
          />
        )}
        {!loading && !error && blobUrl && isImage && (
          <Box
            component="img"
            src={blobUrl}
            alt={filename}
            sx={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
        )}
        {!loading && !error && blobUrl && !isPdf && !isImage && (
          <Alert severity="info">Preview not available for {contentType}</Alert>
        )}
      </Box>
    </Box>
  );
}
