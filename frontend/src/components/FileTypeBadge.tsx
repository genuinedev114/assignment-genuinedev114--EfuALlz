import DescriptionIcon from "@mui/icons-material/Description";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { Box, Tooltip } from "@mui/material";

interface Props {
  contentType: string;
  /** When true (default false) shows a small text label next to the icon. */
  showLabel?: boolean;
}

/**
 * Small icon (with optional label) showing whether an invoice's source file
 * is a PDF or an image. Used in invoice list rows so users can tell at a
 * glance what kind of file an invoice came from.
 */
export function FileTypeBadge({ contentType, showLabel }: Props) {
  const kind = describe(contentType);
  const Icon = kind.icon;
  return (
    <Tooltip title={kind.long} placement="top">
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          color: "text.secondary",
          flexShrink: 0,
        }}
      >
        <Icon fontSize="small" />
        {showLabel && (
          <Box
            component="span"
            sx={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {kind.short}
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}

function describe(contentType: string) {
  if (contentType === "application/pdf") {
    return { icon: PictureAsPdfIcon, short: "PDF", long: "PDF document" };
  }
  if (contentType.startsWith("image/")) {
    const sub = contentType.split("/")[1] ?? "";
    const short = sub.toUpperCase() || "IMG";
    return { icon: ImageOutlinedIcon, short, long: `${short} image` };
  }
  return { icon: DescriptionIcon, short: "FILE", long: contentType || "Unknown file" };
}
