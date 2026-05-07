import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 220;

/**
 * Lightweight in-house signature pad: a `<canvas>` with pointer event handlers
 * (mouse + touch + pen via Pointer Events) so we don't need a third-party lib.
 * Saves to a PNG data URL trimmed to the canvas dimensions; the backend embeds
 * it via the same `_logo_flowable` decoder used for logos.
 */
export function SignaturePad({ open, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Set up the drawing context every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#171615";
    setIsEmpty(true);
  }, [open]);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.currentTarget.width / rect.width;
    const sy = e.currentTarget.height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPos.current = getPos(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const last = lastPos.current;
    if (!ctx || !last) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPos.current = { x, y };
    if (isEmpty) setIsEmpty(false);
  }

  function end() {
    drawing.current = false;
    lastPos.current = null;
  }

  function clear() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setIsEmpty(true);
  }

  function save() {
    const c = canvasRef.current;
    if (!c || isEmpty) return;
    onSave(c.toDataURL("image/png"));
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Draw signature</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Sign in the box below. Use a mouse, trackpad, or touchscreen.
        </Typography>
        <Box
          sx={{
            border: 1.5,
            borderColor: "divider",
            borderRadius: 2,
            bgcolor: "background.default",
            p: 0.5,
          }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onPointerLeave={end}
            style={{
              display: "block",
              width: "100%",
              height: CANVAS_HEIGHT,
              touchAction: "none",
              cursor: "crosshair",
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={clear} disabled={isEmpty}>Clear</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="primary" onClick={save} disabled={isEmpty}>
          Save signature
        </Button>
      </DialogActions>
    </Dialog>
  );
}
