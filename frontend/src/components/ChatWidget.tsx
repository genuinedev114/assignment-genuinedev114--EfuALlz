import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import {
  Box,
  Fab,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { chat, formatError } from "../api";
import type { ChatStep, ChatTurn } from "../types";

const SUGGESTIONS = [
  "Which invoices are still processing?",
  "Show me failed invoices and retry them.",
  "What's the total amount across completed invoices?",
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [turns, busy, open]);

  useEffect(() => {
    function onToggle() { setOpen((v) => !v); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && open) setOpen(false); }
    window.addEventListener("chat:toggle", onToggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("chat:toggle", onToggle);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    const next: ChatTurn[] = [...turns, { role: "user", content: trimmed }];
    setTurns(next);
    setInput("");
    setBusy(true);
    try {
      const res = await chat(next);
      setTurns([...next, { role: "assistant", content: res.reply, steps: res.steps }]);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Tooltip title={open ? "Close" : "Ask the AI assistant"}>
        <Fab
          component={motion.button}
          color="primary"
          onClick={() => setOpen((v) => !v)}
          // Idle gentle bob — Framer keeps it smooth even when the page repaints.
          animate={open ? { rotate: 180, scale: 0.9, y: 0 } : { rotate: 0, scale: 1, y: [0, -4, 0] }}
          transition={
            open
              ? { duration: 0.25, ease: [0.2, 0.9, 0.3, 1.25] }
              : { y: { duration: 4, repeat: Infinity, ease: "easeInOut" }, rotate: { duration: 0.25 }, scale: { duration: 0.2 } }
          }
          whileHover={!open ? { scale: 1.06, transition: { duration: 0.15 } } : undefined}
          whileTap={{ scale: 0.92 }}
          sx={{
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 1200,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            boxShadow: "0 14px 32px -10px rgba(37, 99, 235, 0.5)",
            "&:hover": { bgcolor: "primary.dark" },
          }}
          aria-label={open ? "Close assistant" : "Open assistant"}
        >
          {open ? <CloseIcon /> : <AutoAwesomeIcon />}
        </Fab>
      </Tooltip>

      <AnimatePresence>
        {open && (
          <Paper
            component={motion.div}
            elevation={12}
            initial={{ opacity: 0, y: 18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.94, transition: { duration: 0.16 } }}
            transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1.25] }}
            sx={{
              position: "fixed",
              right: 24,
              bottom: 96,
              width: 380,
              maxWidth: "calc(100vw - 32px)",
              height: 560,
              maxHeight: "calc(100vh - 120px)",
              display: "flex",
              flexDirection: "column",
              borderRadius: 4,
              overflow: "hidden",
              zIndex: 1199,
              transformOrigin: "bottom right",
            }}
          >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              display: "grid",
              placeItems: "center",
            }}
          >
            <AutoAwesomeIcon fontSize="small" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 650 }}>AI assistant</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
              Ask, query, take action
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Box
          ref={scrollerRef}
          sx={{ flex: 1, overflow: "auto", px: 1.5, py: 1.5, display: "flex", flexDirection: "column", gap: 1 }}
        >
          {turns.length === 0 && (
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Hi! I can look up your invoices, summarize totals, and retry failed ones.
              </Typography>
              <Stack spacing={1}>
                {SUGGESTIONS.map((s) => (
                  <Paper
                    key={s}
                    variant="outlined"
                    onClick={() => send(s)}
                    sx={{
                      px: 1.5,
                      py: 1,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      "&:hover": {
                        borderColor: "primary.main",
                        backgroundColor: "action.hover",
                        transform: "translateX(4px)",
                      },
                    }}
                  >
                    <Typography variant="body2">{s}</Typography>
                  </Paper>
                ))}
              </Stack>
            </Stack>
          )}
          {turns.map((t, i) => <Turn key={i} turn={t} />)}
          {busy && (
            <Stack direction="row">
              <Box
                sx={{
                  px: 1.75,
                  py: 1.5,
                  borderRadius: 2,
                  bgcolor: "action.hover",
                  border: 1,
                  borderColor: "divider",
                  display: "flex",
                  gap: 0.5,
                }}
              >
                {[0, 1, 2].map((j) => (
                  <Box
                    key={j}
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      bgcolor: "text.secondary",
                      animation: "typing 1.2s ease-in-out infinite",
                      animationDelay: `${j * 0.15}s`,
                    }}
                  />
                ))}
              </Box>
            </Stack>
          )}
        </Box>

        {error && (
          <Box
            sx={{ mx: 1.5, mb: 1, px: 1.25, py: 1, fontSize: 12, color: "error.main", border: 1, borderColor: "error.main", borderRadius: 1.5, bgcolor: "rgba(239, 68, 68, 0.08)" }}
          >
            {error}
          </Box>
        )}

        <Box
          component="form"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          sx={{ display: "flex", gap: 1, p: 1.5, borderTop: 1, borderColor: "divider" }}
        >
          <TextField
            size="small"
            fullWidth
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the assistant…"
            disabled={busy}
          />
          <IconButton type="submit" color="primary" disabled={busy || !input.trim()} sx={{ bgcolor: "primary.main", color: "primary.contrastText", borderRadius: 2, "&:hover": { bgcolor: "primary.dark" }, "&.Mui-disabled": { bgcolor: "primary.main", opacity: 0.4, color: "primary.contrastText" } }}>
            <SendIcon fontSize="small" />
          </IconButton>
        </Box>
          </Paper>
        )}
      </AnimatePresence>
    </>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <Stack direction="row" sx={{ justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <Box
        sx={{
          maxWidth: "90%",
          px: 1.5,
          py: 1.25,
          borderRadius: 2,
          fontSize: 13.5,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          ...(isUser
            ? {
                bgcolor: "primary.main",
                color: "primary.contrastText",
                borderBottomRightRadius: 4,
              }
            : {
                bgcolor: "action.hover",
                border: 1,
                borderColor: "divider",
                borderBottomLeftRadius: 4,
              }),
        }}
      >
        {turn.content}
        {turn.steps && turn.steps.some((s) => s.kind !== "text") && <ToolTrace steps={turn.steps} />}
      </Box>
    </Stack>
  );
}

function ToolTrace({ steps }: { steps: ChatStep[] }) {
  const pairs: { use: ChatStep; result?: ChatStep }[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    if (s.kind !== "tool_use") continue;
    const next = steps[i + 1];
    pairs.push({ use: s, result: next?.kind === "tool_result" ? next : undefined });
  }
  if (pairs.length === 0) return null;
  return (
    <Box component="details" sx={{ mt: 1, fontSize: 12 }}>
      <Box component="summary" sx={{ cursor: "pointer", color: "text.secondary", "&:hover": { color: "text.primary" } }}>
        {pairs.length} tool call{pairs.length === 1 ? "" : "s"}
      </Box>
      {pairs.map((p, i) => (
        <Box key={i} sx={{ mt: 0.75 }}>
          <Box component="code" sx={{ bgcolor: "rgba(0,0,0,0.3)", px: 0.75, py: 0.25, borderRadius: 0.5, fontSize: 11, fontFamily: 'ui-monospace, "SF Mono", monospace' }}>
            {p.use.tool_name}({JSON.stringify(p.use.tool_input ?? {})})
          </Box>
          {p.result && (
            <Box component="pre" sx={{ mt: 0.5, p: 1, borderRadius: 1, bgcolor: "rgba(0,0,0,0.35)", overflow: "auto", maxHeight: 200, fontSize: 11, fontFamily: 'ui-monospace, "SF Mono", monospace' }}>
              {JSON.stringify(p.result.tool_result, null, 2)}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
