import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
  Link as MuiLink,
} from "@mui/material";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, formatError } from "../api";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await login(identifier.trim(), password);
      signIn(res.token, res.user, "login");
      navigate("/", { replace: true });
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper
      elevation={6}
      sx={{
        position: "relative",
        width: "100%",
        maxWidth: 440,
        p: { xs: 3, sm: 4 },
        borderRadius: 4,
        zIndex: 1,
      }}
      className="animate-rise"
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
        <Box className="brand-mark" />
        <Box sx={{ lineHeight: 1.15 }}>
          <Typography sx={{ fontWeight: 650, fontSize: 15 }}>Invoice Studio</Typography>
          <Typography variant="caption" color="text.secondary">
            AI-powered invoice intelligence
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Button fullWidth variant="contained" color="primary" sx={{ pointerEvents: "none" }}>
          Sign in
        </Button>
        <Button component={Link} to="/register" fullWidth variant="text">
          Create account
        </Button>
      </Stack>

      <Box component="form" onSubmit={handleSubmit}>
        <Typography variant="h2" sx={{ fontSize: 22, mb: 0.5 }}>Welcome back</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Sign in with your username or email.
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Username or email"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoFocus
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="large"
            disabled={busy || !identifier || !password}
            sx={{ py: 1.25 }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            Don't have an account? <MuiLink component={Link} to="/register">Create one</MuiLink>
          </Typography>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Paper>
  );
}
