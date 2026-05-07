import { Box, Button, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <Box
      className="page-content"
      sx={{ textAlign: "center", py: 6, alignItems: "center", display: "flex", flexDirection: "column" }}
    >
      <Typography
        sx={{
          fontSize: 120,
          fontWeight: 800,
          letterSpacing: "-0.05em",
          color: "text.primary",
          lineHeight: 1,
        }}
        className="animate-rise"
      >
        404
      </Typography>
      <Typography variant="h1" sx={{ fontSize: 22, my: 1 }}>Page not found</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The page you were looking for doesn't exist or has moved.
      </Typography>
      <Stack direction="row" spacing={1.5} justifyContent="center">
        <Button component={Link} to="/" variant="contained" color="primary">Go to dashboard</Button>
        <Button component={Link} to="/invoices" variant="outlined">View invoices</Button>
      </Stack>
    </Box>
  );
}
