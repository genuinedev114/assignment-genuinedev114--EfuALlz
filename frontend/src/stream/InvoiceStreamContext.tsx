import { createContext, useContext, type ReactNode } from "react";
import { useInvoiceStream } from "../hooks/useInvoiceStream";
import type { Invoice } from "../types";

interface StreamState {
  invoices: Invoice[];
  connected: boolean;
  error: string | null;
}

const Ctx = createContext<StreamState | null>(null);

/** Wrap authed pages with this so they share a single live invoice list + WS connection. */
export function InvoiceStreamProvider({ children }: { children: ReactNode }) {
  const stream = useInvoiceStream(true);
  return <Ctx.Provider value={stream}>{children}</Ctx.Provider>;
}

export function useInvoices(): StreamState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useInvoices must be used inside InvoiceStreamProvider");
  return v;
}
