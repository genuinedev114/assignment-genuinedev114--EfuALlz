import { CssBaseline, ThemeProvider } from "@mui/material";
import { useMemo, type ReactNode } from "react";
import { useTheme } from "../auth/ThemeContext";
import { buildMuiTheme } from "./muiTheme";

/** Bridges our ThemeContext (light/dark) into MUI's ThemeProvider. */
export function MuiThemeBridge({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const muiTheme = useMemo(() => buildMuiTheme(theme), [theme]);
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
