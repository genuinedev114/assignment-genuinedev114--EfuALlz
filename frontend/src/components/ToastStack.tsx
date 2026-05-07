import { Alert, AlertTitle, Box, Stack } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { useNotifications, type ToastKind } from "../notifications/NotificationsContext";

const KIND_TO_SEVERITY: Record<ToastKind, "info" | "success" | "warning" | "error"> = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
};

/**
 * Top-right toast list. Plain fixed-position Stack (no MUI Snackbar wrapper)
 * so toasts always stack vertically — Snackbar's internal layout had been
 * causing them to render side-by-side once two were active.
 */
export function ToastStack() {
  const { toasts, dismiss } = useNotifications();
  return (
    <Box
      sx={{
        position: "fixed",
        top: 24,
        right: 24,
        zIndex: 1500,
        width: 360,
        maxWidth: "calc(100vw - 32px)",
        pointerEvents: "none",
      }}
    >
      <Stack
        direction="column"
        spacing={1.25}
        sx={{ width: "100%", pointerEvents: "auto" }}
        component={Box}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 32, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 32, scale: 0.95, transition: { duration: 0.18 } }}
              transition={{ duration: 0.32, ease: [0.2, 0.85, 0.3, 1.05] }}
            >
              <Alert
                severity={KIND_TO_SEVERITY[t.kind]}
                variant="filled"
                onClose={() => dismiss(t.id)}
                sx={{ alignItems: "flex-start", boxShadow: 8, borderRadius: 2 }}
              >
                <AlertTitle sx={{ mb: t.body ? 0.25 : 0, fontWeight: 650 }}>{t.title}</AlertTitle>
                {t.body}
              </Alert>
            </motion.div>
          ))}
        </AnimatePresence>
      </Stack>
    </Box>
  );
}
