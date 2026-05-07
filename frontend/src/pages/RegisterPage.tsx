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
import { register, formatError } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Checklist, passwordChecks, usernameChecks } from "./auth-shared";

export function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameAllMet = username.length > 0 && usernameChecks(username).every((c) => c.met);
  const passwordAllMet = password.length > 0 && passwordChecks(password).every((c) => c.met);
  const matches = password.length > 0 && password === passwordConfirm;
  const canSubmit = !busy && !!email && usernameAllMet && passwordAllMet && matches;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await register(username.trim(), email.trim(), password, passwordConfirm);
      signIn(res.token, res.user, "register");
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
      sx={{ position: "relative", width: "100%", maxWidth: 460, p: { xs: 3, sm: 4 }, borderRadius: 4, zIndex: 1 }}
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
        <Button component={Link} to="/login" fullWidth variant="text">
          Sign in
        </Button>
        <Button fullWidth variant="contained" color="primary" sx={{ pointerEvents: "none" }}>
          Create account
        </Button>
      </Stack>

      <Box component="form" onSubmit={handleSubmit}>
        <Typography variant="h2" sx={{ fontSize: 22, mb: 0.5 }}>Create your account</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Pick a username and password to get started.
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            inputProps={{ maxLength: 32 }}
          />
          <Checklist items={usernameChecks(username)} single />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Checklist items={passwordChecks(password)} />
          <TextField
            label="Confirm password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
            error={passwordConfirm.length > 0 && passwordConfirm !== password}
            helperText={
              passwordConfirm.length > 0 && passwordConfirm !== password
                ? "Passwords do not match."
                : undefined
            }
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="large"
            disabled={!canSubmit}
            sx={{ py: 1.25 }}
          >
            {busy ? "Creating account…" : "Create account"}
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            Already have an account? <MuiLink component={Link} to="/login">Sign in</MuiLink>
          </Typography>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Paper>
  );
}
