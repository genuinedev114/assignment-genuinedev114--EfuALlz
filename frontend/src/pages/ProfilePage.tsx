import {
  Avatar,
  Box,
  Button,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useInvoices } from "../stream/InvoiceStreamContext";

export function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { invoices } = useInvoices();
  const [confirm, setConfirm] = useState(false);

  if (!user) return null;

  const counts = {
    total: invoices.length,
    completed: invoices.filter((i) => i.status === "completed").length,
    failed: invoices.filter((i) => i.status === "failed").length,
  };

  function handleSignOut() {
    setConfirm(false);
    signOut();
    navigate("/login", { replace: true });
  }

  return (
    <Box className="page-content">
      <Box sx={{ mb: 2 }}>
        <Typography variant="h1" sx={{ fontSize: 26 }}>Profile</Typography>
        <Typography variant="body2" color="text.secondary">Your account details.</Typography>
      </Box>

      <Paper sx={{ p: 3, mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ pb: 2, mb: 2, borderBottom: 1, borderColor: "divider" }}>
          <Avatar
            sx={{
              width: 56,
              height: 56,
              fontSize: 22,
              fontWeight: 700,
              bgcolor: "primary.main",
              color: "primary.contrastText",
            }}
          >
            {user.username[0]?.toUpperCase()}
          </Avatar>
          <Box>
            <Typography sx={{ fontSize: 18, fontWeight: 650 }}>@{user.username}</Typography>
            <Typography variant="body2" color="text.secondary">{user.email}</Typography>
          </Box>
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              User ID
            </Typography>
            <Typography sx={{ fontFamily: 'ui-monospace, "SF Mono", monospace', fontSize: 12 }}>{user.id}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Username
            </Typography>
            <Typography>@{user.username}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Email
            </Typography>
            <Typography>{user.email}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Invoices
            </Typography>
            <Typography>
              {counts.total} total · {counts.completed} completed · {counts.failed} failed
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h2" sx={{ fontSize: 14, mb: 0.5 }}>Danger zone</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Sign out of this device. Your data stays on the server.
        </Typography>
        <Button variant="outlined" color="error" onClick={() => setConfirm(true)}>
          Sign out
        </Button>
      </Paper>

      <ConfirmDialog
        open={confirm}
        title="Sign out?"
        description={`You'll be signed out as @${user.username}. You can sign back in anytime.`}
        confirmLabel="Sign out"
        onCancel={() => setConfirm(false)}
        onConfirm={handleSignOut}
      />
    </Box>
  );
}
