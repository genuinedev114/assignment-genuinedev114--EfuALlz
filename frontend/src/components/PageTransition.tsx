import { Box } from "@mui/material";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Tiny wrapper applied to each routed page so navigations get a smooth
 * cross-fade + 6px lift instead of an instant snap. Pair with
 * `<AnimatePresence mode="wait">` in the router.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.32, ease: [0.2, 0.85, 0.3, 1.05] }}
    >
      {children}
    </Box>
  );
}
