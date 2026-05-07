import { createTheme, type Theme } from "@mui/material/styles";
import type { Theme as AppTheme } from "../auth/ThemeContext";

declare module "@mui/material/styles" {
  interface Palette { gradient: string }
  interface PaletteOptions { gradient?: string }
}

/**
 * Global SaaS palette: indigo-blue primary on warm neutral surfaces. Inspired
 * by Stripe / Linear / Slack — the colour family business users see every day,
 * so it reads as professional rather than novelty. Status colours stay
 * semantic (blue / amber / green / red) so they read as data.
 *
 * `palette.gradient` is a back-compat key used by older code; it now holds a
 * crisp two-stop indigo gradient for the few places we want a brand accent.
 */
export function buildMuiTheme(mode: AppTheme): Theme {
  const isDark = mode === "dark";

  // Brand: indigo-600 with a subtle gradient toward indigo-500/cyan-500.
  const brand = "#2563eb";
  const brandHover = "#1d4ed8";
  const brandSoft = isDark ? "#3b82f6" : "#1e40af";
  const gradient = `linear-gradient(135deg, ${brand} 0%, #06b6d4 100%)`;

  return createTheme({
    palette: {
      mode,
      gradient,
      primary: { main: brand, dark: brandHover, light: brandSoft, contrastText: "#ffffff" },
      secondary: { main: "#06b6d4", contrastText: "#ffffff" }, // cyan-500 for highlights
      background: isDark
        ? { default: "#0b1220", paper: "rgba(20, 27, 41, 0.78)" }
        : { default: "#f8fafc", paper: "rgba(255, 255, 255, 0.86)" },
      text: isDark
        ? { primary: "#e2e8f0", secondary: "#94a3b8" }
        : { primary: "#0f172a", secondary: "#475569" },
      divider: isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.10)",
      success: { main: "#10b981" },
      warning: { main: "#f59e0b" },
      error: { main: "#ef4444" },
      info: { main: brand },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      h1: { fontWeight: 700, letterSpacing: "-0.025em" },
      h2: { fontWeight: 650, letterSpacing: "-0.018em" },
      h3: { fontWeight: 650, letterSpacing: "-0.012em" },
      button: { fontWeight: 600, textTransform: "none", letterSpacing: 0 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 10,
            fontWeight: 600,
            paddingInline: 14,
            paddingBlock: 7,
            transition: "transform 0.18s cubic-bezier(0.2, 0.85, 0.3, 1.15), box-shadow 0.18s ease, background-color 0.2s ease",
            "&:active": { transform: "scale(0.97)" },
          },
          containedPrimary: {
            backgroundColor: brand,
            color: "#ffffff",
            boxShadow: "0 6px 16px -8px rgba(37, 99, 235, 0.55)",
            "&:hover": {
              backgroundColor: brandHover,
              boxShadow: "0 10px 24px -10px rgba(37, 99, 235, 0.6)",
              transform: "translateY(-1px)",
            },
            "&.Mui-disabled": { backgroundColor: brand, opacity: 0.45, color: "#ffffff" },
          },
          outlinedPrimary: {
            borderColor: isDark ? "rgba(148, 163, 184, 0.22)" : "rgba(15, 23, 42, 0.16)",
            color: "text.primary",
            "&:hover": {
              borderColor: brand,
              backgroundColor: isDark ? "rgba(37, 99, 235, 0.10)" : "rgba(37, 99, 235, 0.06)",
            },
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: "small", fullWidth: true, variant: "outlined" },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            transition: "box-shadow 0.18s ease, border-color 0.18s ease",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: "transparent" },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundImage: "none",
            borderRight: isDark ? "1px solid rgba(148, 163, 184, 0.16)" : "1px solid rgba(15, 23, 42, 0.10)",
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 16, padding: 4 },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { fontSize: 12, borderRadius: 8, padding: "6px 10px" },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: { borderRadius: 12 },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { transition: "transform 0.18s ease, background-color 0.2s ease" },
        },
      },
    },
  });
}
