import { useEffect, useRef, useState } from "react";
import { consumeSelfUploaded, getToken, listInvoices } from "../api";
import { useNotifications } from "../notifications/NotificationsContext";
import type { Invoice, InvoiceStatus, WSEvent } from "../types";

/**
 * Loads the invoice list once, then keeps it in sync via WebSocket events.
 * Reconnects with exponential backoff on disconnect; on reconnect we re-fetch
 * the full list to recover any events missed while disconnected.
 *
 * Authenticates via `?token=...` query param since browsers can't set custom
 * headers on WebSocket connections. Surfaces invoice events as toast notifications.
 */
export function useInvoiceStream(enabled: boolean) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(500);
  const { push } = useNotifications();
  // Track the previous status of every invoice so we only notify on transitions.
  const statusRef = useRef<Map<string, InvoiceStatus>>(new Map());
  // Suppress the initial load (don't fire a toast for every existing invoice).
  const primedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setInvoices([]);
      setConnected(false);
      statusRef.current.clear();
      primedRef.current = false;
      return;
    }
    let cancelled = false;

    async function refresh() {
      try {
        const list = await listInvoices();
        if (cancelled) return;
        setInvoices(list);
        // Seed the status map from the initial list so the first deltas fire correctly.
        const map = new Map<string, InvoiceStatus>();
        for (const inv of list) map.set(inv.id, inv.status);
        statusRef.current = map;
        primedRef.current = true;
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }

    function notifyForEvent(ev: WSEvent) {
      if (!primedRef.current) return; // first load — suppress
      if (ev.type === "invoice.created") {
        // If this client just uploaded the file, the UploadButton already
        // toasted "Uploaded — filename". Skip the duplicate.
        if (consumeSelfUploaded(ev.invoice.id)) return;
        push({
          kind: "info",
          title: "Invoice uploaded",
          body: ev.invoice.filename,
        });
      } else if (ev.type === "invoice.updated") {
        const next = ev.invoice.status as InvoiceStatus | undefined;
        if (!next) return;
        const prev = statusRef.current.get(ev.invoice.id);
        if (prev === next) return;
        if (next === "completed") {
          push({
            kind: "success",
            title: "Invoice processed",
            body: ev.invoice.filename ?? "Extraction finished.",
          });
        } else if (next === "failed") {
          push({
            kind: "error",
            title: "Processing failed",
            body: ev.invoice.error || ev.invoice.filename || "Extraction failed.",
          });
        } else if (next === "processing" && prev !== undefined) {
          push({
            kind: "info",
            title: "Processing started",
            body: ev.invoice.filename,
          });
        }
      } else if (ev.type === "invoice.deleted") {
        push({ kind: "warning", title: "Invoice deleted" });
      }
    }

    function connect() {
      const token = getToken();
      if (!token) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        backoffRef.current = 500;
        refresh();
      };

      ws.onmessage = (ev) => {
        let data: WSEvent;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        notifyForEvent(data);
        setInvoices((prev) => applyEvent(prev, data, statusRef.current));
      };

      ws.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        const delay = Math.min(backoffRef.current, 10_000);
        backoffRef.current = Math.min(backoffRef.current * 2, 10_000);
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [enabled, push]);

  return { invoices, connected, error };
}

function applyEvent(
  prev: Invoice[],
  ev: WSEvent,
  statusMap: Map<string, InvoiceStatus>,
): Invoice[] {
  if (ev.type === "invoice.created") {
    statusMap.set(ev.invoice.id, ev.invoice.status);
    if (prev.some((i) => i.id === ev.invoice.id)) return prev;
    return [ev.invoice, ...prev];
  }
  if (ev.type === "invoice.updated") {
    if (ev.invoice.status) statusMap.set(ev.invoice.id, ev.invoice.status as InvoiceStatus);
    return prev.map((i) => (i.id === ev.invoice.id ? { ...i, ...ev.invoice } : i));
  }
  if (ev.type === "invoice.deleted") {
    statusMap.delete(ev.id);
    return prev.filter((i) => i.id !== ev.id);
  }
  return prev;
}
