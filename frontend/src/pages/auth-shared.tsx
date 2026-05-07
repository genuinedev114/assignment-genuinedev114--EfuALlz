// Shared bits used by Login + Register + Settings pages.
import CheckIcon from "@mui/icons-material/Check";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { Box, List, ListItem, ListItemIcon, ListItemText, Paper } from "@mui/material";

export function CheckOrDot({ met }: { met: boolean }) {
  return met ? (
    <CheckIcon fontSize="small" sx={{ color: "success.main" }} />
  ) : (
    <FiberManualRecordIcon sx={{ fontSize: 8, color: "text.secondary" }} />
  );
}

export function usernameChecks(name: string) {
  return [
    { label: "3-32 characters", met: name.length >= 3 && name.length <= 32 },
    {
      label: "Letters, numbers, dashes, or underscores",
      met: /^[a-zA-Z0-9_-]*$/.test(name) && name.length > 0,
    },
  ];
}

export function passwordChecks(pw: string) {
  return [
    { label: "At least 8 characters", met: pw.length >= 8 },
    { label: "An uppercase letter (A-Z)", met: /[A-Z]/.test(pw) },
    { label: "A lowercase letter (a-z)", met: /[a-z]/.test(pw) },
    { label: "A number (0-9)", met: /\d/.test(pw) },
    { label: "A symbol (!@#$ etc.)", met: /[^A-Za-z0-9]/.test(pw) },
  ];
}

export function Checklist({
  items,
  single,
}: {
  items: { label: string; met: boolean }[];
  single?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1, bgcolor: "background.default", borderRadius: 2 }}
    >
      <List
        dense
        disablePadding
        sx={{
          display: "grid",
          gridTemplateColumns: single ? "1fr" : { xs: "1fr", sm: "1fr 1fr" },
          rowGap: 0.25,
          columnGap: 1,
        }}
      >
        {items.map((c) => (
          <ListItem
            key={c.label}
            disableGutters
            disablePadding
            sx={{ pl: 1, color: c.met ? "success.main" : "text.secondary" }}
          >
            <ListItemIcon sx={{ minWidth: 24, justifyContent: "center", color: "inherit" }}>
              <Box sx={{ width: 18, height: 18, display: "grid", placeItems: "center" }}>
                <CheckOrDot met={c.met} />
              </Box>
            </ListItemIcon>
            <ListItemText
              primary={c.label}
              primaryTypographyProps={{ fontSize: 12, color: "inherit" }}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}
