import {
  Alert,
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState, type FormEvent } from "react";
import { changePassword, formatError } from "../api";
import { useNotifications } from "../notifications/NotificationsContext";
import { Checklist, passwordChecks } from "./auth-shared";

export function SettingsPage() {
  const { push } = useNotifications();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allMet = passwordChecks(next).every((c) => c.met);
  const matches = next.length > 0 && next === confirm;
  const canSubmit = !!current && allMet && matches && next !== current;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setBusy(true);
    try {
      await changePassword(current, next, confirm);
      push({
        kind: "success",
        title: "Password updated",
        body: "Use your new password next time you sign in.",
      });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box className="page-content">
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 2 }}>
        <Box>
          <Typography variant="h1" sx={{ fontSize: 26 }}>Settings</Typography>
          <Typography variant="body2" color="text.secondary">Manage your account.</Typography>
        </Box>
      </Box>

      <Paper sx={{ p: 3, mb: 2, maxWidth: 540 }}>
        <Typography variant="h2" sx={{ fontSize: 16, mb: 1.5 }}>Change password</Typography>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              label="Current password"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
            <TextField
              label="New password"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <Checklist items={passwordChecks(next)} />
            <TextField
              label="Confirm new password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              error={confirm.length > 0 && confirm !== next}
              helperText={
                confirm.length > 0 && confirm !== next
                  ? "Passwords do not match."
                  : next && current && next === current
                    ? "New password must differ from current."
                    : undefined
              }
            />
            <Button
              type="submit"
              variant="contained"
              color="primary"
              size="large"
              disabled={busy || !canSubmit}
              sx={{ py: 1.25 }}
            >
              {busy ? "Updating…" : "Update password"}
            </Button>
          </Stack>
        </Box>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h2" sx={{ fontSize: 16, mb: 1 }}>Keyboard shortcuts</Typography>
        <List dense disablePadding>
          {[
            { keys: ["Ctrl", "U"], label: "Open upload picker" },
            { keys: ["Ctrl", "K"], label: "Toggle the AI assistant" },
            { keys: ["Ctrl", "L"], label: "Go to invoices" },
            { keys: ["/"], label: "Focus search (on Invoices page)" },
            { keys: ["Esc"], label: "Close chat" },
          ].map((s) => (
            <ListItem key={s.label} disableGutters>
              <Box sx={{ minWidth: 130 }}>
                {s.keys.map((k, i) => (
                  <Box
                    component="kbd"
                    key={i}
                    sx={{
                      mr: i < s.keys.length - 1 ? 0.5 : 1,
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 0.75,
                      border: 1,
                      borderColor: "divider",
                      borderBottomWidth: 2,
                      fontFamily: 'ui-monospace, "SF Mono", monospace',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {k}
                  </Box>
                ))}
              </Box>
              <ListItemText primary={s.label} primaryTypographyProps={{ fontSize: 13, color: "text.secondary" }} />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
}
