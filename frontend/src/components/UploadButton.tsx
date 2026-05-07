import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { Button, type ButtonProps } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { markSelfUploaded, uploadInvoice } from "../api";
import { useNotifications } from "../notifications/NotificationsContext";

type Props = Omit<ButtonProps, "onClick"> & {
  /** Optional label override. Defaults to "Upload invoice". */
  label?: string;
};

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

/**
 * One-click upload: clicking opens the OS file picker, the chosen files
 * upload immediately, and progress is surfaced via toasts. Live WS events
 * make the new rows appear in lists without navigation.
 *
 * Also listens for a global `upload:open` CustomEvent so keyboard shortcuts
 * (Ctrl/Cmd+U) can trigger the same flow.
 */
export function UploadButton({ label = "Upload invoice", ...buttonProps }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useNotifications();

  function pick() {
    if (busy) return;
    inputRef.current?.click();
  }

  useEffect(() => {
    function onOpen() { pick(); }
    window.addEventListener("upload:open", onOpen);
    return () => window.removeEventListener("upload:open", onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    let succeeded = 0;
    // No "Uploading…" pre-toast — the button itself shows that state. Only the
    // *result* (success or error) becomes a notification, keeping the count to one.
    try {
      for (const f of list) {
        try {
          const inv = await uploadInvoice(f);
          // Tell the WS-event handler not to fire its own "Invoice uploaded"
          // toast for this row — we're about to fire the local one below.
          markSelfUploaded(inv.id);
          succeeded++;
        } catch (e) {
          // UploadError carries a friendly message + a stable code we can
          // tailor titles for.
          const code = (e as { code?: string })?.code;
          let title: string;
          switch (code) {
            case "duplicate":   title = "Already uploaded"; break;
            case "unsupported": title = "Unsupported file type"; break;
            case "too_large":   title = "File too large"; break;
            case "empty":       title = "Empty file"; break;
            case "auth":        title = "Not signed in"; break;
            default:            title = "Upload failed";
          }
          push({ kind: "error", title, body: `${f.name} — ${(e as Error).message}` });
        }
      }
      if (succeeded > 0) {
        push({
          kind: "success",
          title: succeeded === 1 ? "Invoice uploaded" : `${succeeded} invoices uploaded`,
          body: succeeded === 1 ? list[0]!.name : "Watch the list for live status.",
        });
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <Button
        startIcon={<CloudUploadIcon />}
        variant="contained"
        color="primary"
        disabled={busy}
        onClick={pick}
        {...buttonProps}
      >
        {busy ? "Uploading…" : label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
        }}
      />
    </>
  );
}
