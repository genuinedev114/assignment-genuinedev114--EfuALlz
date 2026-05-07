import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../notifications/NotificationsContext";

/**
 * Global keyboard shortcuts. Mounted once at the app level so they work on every page.
 * - Ctrl/Cmd+U → /upload
 * - Ctrl/Cmd+K → toggle the chat widget (dispatches a CustomEvent the widget listens for)
 * - Ctrl/Cmd+L → /invoices
 * - "/"        → focus the first [data-search-input] field on the page
 * - "?"        → show a toast cheat-sheet
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const { push } = useNotifications();

  useEffect(() => {
    function isEditingInput(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "u") {
        // Instant upload — dispatch a global event the UploadButton listens for.
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("upload:open"));
        return;
      }
      if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        navigate("/invoices");
        return;
      }
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("chat:toggle"));
        return;
      }

      // Single-character shortcuts: ignore when typing in a form field.
      if (isEditingInput(e.target)) return;

      if (e.key === "/") {
        const el = document.querySelector<HTMLInputElement>("[data-search-input]");
        if (el) {
          e.preventDefault();
          el.focus();
          el.select();
        }
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        push({
          kind: "info",
          title: "Keyboard shortcuts",
          body: "Ctrl+U upload · Ctrl+L invoices · Ctrl+K chat · / search · Esc close",
        });
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, push]);
}
