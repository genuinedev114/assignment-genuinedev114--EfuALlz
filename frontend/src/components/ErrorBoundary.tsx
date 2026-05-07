import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors anywhere in the tree and shows a recoverable fallback
 * instead of a blank page. The error is logged to the console so devs see the
 * stack; the UI offers a soft retry (resetting state) and a hard reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          p: 3,
          bgcolor: "background.default",
        }}
      >
        <Paper sx={{ maxWidth: 520, p: 4, borderRadius: 4 }}>
          <Stack spacing={1.5}>
            <Typography variant="h2" sx={{ fontSize: 22, fontWeight: 700 }}>
              Something went wrong
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The page hit an unexpected error. You can try again, or reload to start fresh.
            </Typography>
            <Box
              sx={{
                bgcolor: "action.hover",
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                p: 1.5,
                fontFamily: 'ui-monospace, "SF Mono", monospace',
                fontSize: 12,
                color: "text.secondary",
                wordBreak: "break-word",
                maxHeight: 160,
                overflow: "auto",
              }}
            >
              {this.state.error.message || String(this.state.error)}
            </Box>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button variant="contained" color="primary" onClick={this.reset}>
                Try again
              </Button>
              <Button variant="text" onClick={() => location.reload()}>
                Reload page
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    );
  }
}
