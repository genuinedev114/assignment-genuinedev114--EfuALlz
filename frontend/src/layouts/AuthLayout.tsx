import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle";

export function AuthLayout() {
  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        p: { xs: 2, md: 4 },
        overflow: "hidden",
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: "-10%",
          background: `
            radial-gradient(45% 40% at 20% 30%, rgba(180, 90, 60, 0.10), transparent 70%),
            radial-gradient(50% 40% at 80% 70%, rgba(60, 80, 100, 0.08), transparent 70%),
            radial-gradient(40% 50% at 50% 110%, rgba(120, 100, 80, 0.06), transparent 70%)
          `,
          filter: "blur(40px)",
          pointerEvents: "none",
          animation: "bgFloat 28s ease-in-out infinite",
        }}
      />
      <Box sx={{ position: "absolute", top: 16, right: 16, zIndex: 2 }}>
        <ThemeToggle />
      </Box>
      <Outlet />
    </Box>
  );
}
