import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import {
  AppBar,
  Avatar,
  Box,
  Chip,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ChatWidget } from "../components/ChatWidget";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ThemeToggle } from "../components/ThemeToggle";
import { TopNav } from "../components/TopNav";
import { InvoiceStreamProvider, useInvoices } from "../stream/InvoiceStreamContext";

export function AppLayout() {
  return (
    <InvoiceStreamProvider>
      <Shell />
    </InvoiceStreamProvider>
  );
}

function Shell() {
  const { user, signOut } = useAuth();
  const { connected } = useInvoices();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(menuAnchor);

  function closeMenu() { setMenuAnchor(null); }
  function openSignOutConfirm() {
    closeMenu();
    setConfirmOpen(true);
  }
  function handleSignOutConfirmed() {
    setConfirmOpen(false);
    signOut();
    navigate("/login", { replace: true });
  }

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        sx={{
          backgroundColor: (t) => t.palette.background.paper,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box className="brand-mark" sx={{ width: 32, height: 32 }} />
            <Box sx={{ lineHeight: 1.15, display: { xs: "none", sm: "block" } }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 14 }}>
                Invoice Studio
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                @{user?.username}
              </Typography>
            </Box>
          </Stack>

          <TopNav />

          <Box sx={{ flexGrow: 1 }} />

          <Stack direction="row" spacing={1.25} alignItems="center">
            <Chip
              size="small"
              label={connected ? "Live" : "Reconnecting"}
              color={connected ? "success" : "warning"}
              variant="outlined"
              sx={{
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontSize: 10,
                display: { xs: "none", sm: "inline-flex" },
              }}
            />
            <ThemeToggle />

            {/* User chip — clicking opens the right-side dropdown menu. */}
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              role="button"
              tabIndex={0}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setMenuAnchor(e.currentTarget as HTMLElement);
                }
              }}
              sx={{
                pl: 1,
                pr: 0.75,
                py: 0.5,
                border: 1,
                borderColor: menuOpen ? "primary.main" : "divider",
                borderRadius: 999,
                cursor: "pointer",
                userSelect: "none",
                transition: "border-color 0.18s, background-color 0.18s",
                "&:hover": { backgroundColor: "action.hover" },
              }}
            >
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {user?.username[0]?.toUpperCase()}
              </Avatar>
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, fontSize: 12, display: { xs: "none", lg: "inline" } }}
              >
                @{user?.username}
              </Typography>
              <KeyboardArrowDownIcon
                fontSize="small"
                sx={{
                  color: "text.secondary",
                  transition: "transform 0.2s",
                  transform: menuOpen ? "rotate(180deg)" : "none",
                }}
              />
            </Stack>

            <Menu
              anchorEl={menuAnchor}
              open={menuOpen}
              onClose={closeMenu}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1,
                    minWidth: 200,
                    borderRadius: 2,
                    boxShadow: "0 14px 36px -12px rgba(15, 23, 42, 0.35)",
                  },
                },
              }}
            >
              <Box sx={{ px: 2, py: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.1 }}>
                  Signed in as
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: 13 }}>@{user?.username}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2, wordBreak: "break-all" }}>
                  {user?.email}
                </Typography>
              </Box>
              <Divider />
              <MenuItem component={Link} to="/profile" onClick={closeMenu}>
                <ListItemIcon><PersonOutlineIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Profile</ListItemText>
              </MenuItem>
              <MenuItem component={Link} to="/settings" onClick={closeMenu}>
                <ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Settings</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem onClick={openSignOutConfirm}>
                <ListItemIcon><LogoutIcon fontSize="small" sx={{ color: "error.main" }} /></ListItemIcon>
                <ListItemText
                  primary="Sign out"
                  primaryTypographyProps={{ color: "error.main", fontWeight: 600 }}
                />
              </MenuItem>
            </Menu>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          minWidth: 0,
          px: { xs: 2, md: 4 },
          py: 4,
          mt: "64px",
        }}
      >
        <Outlet />
      </Box>

      <ChatWidget />

      <ConfirmDialog
        open={confirmOpen}
        title="Sign out?"
        description={user ? `You'll be signed out as @${user.username}. You can sign back in anytime.` : undefined}
        confirmLabel="Sign out"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleSignOutConfirmed}
      />
    </Box>
  );
}
