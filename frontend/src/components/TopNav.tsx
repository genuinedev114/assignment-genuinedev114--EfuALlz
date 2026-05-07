import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { Badge, Box, Button, Stack } from "@mui/material";
import { NavLink, useLocation } from "react-router-dom";
import { useInvoices } from "../stream/InvoiceStreamContext";

// Profile and Settings live in the user-chip dropdown on the right; the top nav
// keeps just the workflow destinations.
const ITEMS = [
  { to: "/", label: "Dashboard", icon: <DashboardIcon fontSize="small" /> },
  { to: "/invoices", label: "Invoices", icon: <ReceiptLongIcon fontSize="small" />, badge: true },
  { to: "/invoices/new", label: "Create", icon: <AddCircleOutlineIcon fontSize="small" /> },
];

export function TopNav() {
  const location = useLocation();
  const { invoices } = useInvoices();
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        ml: 1,
        // Hide on narrow viewports — there's no room beside the user chip + theme toggle.
        display: { xs: "none", md: "flex" },
      }}
    >
      {ITEMS.map((item) => {
        // /invoices/new should highlight Create, not Invoices.
        const active =
          item.to === "/" ? location.pathname === "/" :
          item.to === "/invoices" ? location.pathname === "/invoices" :
          location.pathname.startsWith(item.to);
        return (
          <Button
            key={item.to}
            component={NavLink}
            to={item.to}
            end={item.to === "/"}
            startIcon={item.icon}
            color="inherit"
            size="small"
            sx={{
              px: 1.5,
              py: 0.75,
              fontWeight: active ? 700 : 500,
              color: active ? "text.primary" : "text.secondary",
              position: "relative",
              borderRadius: 1.5,
              "&:hover": { bgcolor: "action.hover", color: "text.primary" },
              "&::after": active
                ? {
                    content: '""',
                    position: "absolute",
                    left: 12,
                    right: 12,
                    bottom: 2,
                    height: 2,
                    bgcolor: "text.primary",
                    borderRadius: 999,
                  }
                : undefined,
            }}
          >
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
              {item.label}
              {item.badge && invoices.length > 0 && (
                <Badge
                  badgeContent={invoices.length}
                  color="default"
                  sx={{
                    "& .MuiBadge-badge": {
                      position: "static",
                      transform: "none",
                      bgcolor: active ? "text.primary" : "action.selected",
                      color: active ? "background.default" : "text.secondary",
                      fontSize: 10,
                      fontWeight: 700,
                      height: 16,
                      minWidth: 16,
                      borderRadius: 999,
                    },
                  }}
                />
              )}
            </Box>
          </Button>
        );
      })}
    </Stack>
  );
}
