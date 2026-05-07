import AddIcon from "@mui/icons-material/Add";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CreateIcon from "@mui/icons-material/Create";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import PrintIcon from "@mui/icons-material/Print";
import VisibilityIcon from "@mui/icons-material/Visibility";
import {
  Alert,
  Box,
  Button,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { formatError, generateInvoice, getToken, type InvoiceGenerateInput } from "../api";
import { SignaturePad } from "../components/SignaturePad";
import { useNotifications } from "../notifications/NotificationsContext";

interface PartyDraft {
  name: string;
  email: string;
  address: string;
  city: string;
  phone: string;
  tax_id: string;
}

interface ItemDraft {
  description: string;
  details: string;
  rate: string;
  quantity: string;
}

const EMPTY_PARTY: PartyDraft = { name: "", email: "", address: "", city: "", phone: "", tax_id: "" };
const EMPTY_ITEM: ItemDraft = { description: "", details: "", rate: "", quantity: "1" };

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "INR", "CNY"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CreateInvoicePage() {
  const navigate = useNavigate();
  const { push } = useNotifications();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const signatureInputRef = useRef<HTMLInputElement | null>(null);
  const footerInputRef = useRef<HTMLInputElement | null>(null);

  // Top-level invoice meta
  const [title, setTitle] = useState("Invoice");
  const [number, setNumber] = useState(`INV-${Date.now().toString().slice(-6)}`);
  const [date, setDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [footerImageDataUrl, setFooterImageDataUrl] = useState<string | null>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);

  // Settings
  const [currency, setCurrency] = useState("USD");
  const [theme, setTheme] = useState<"modern" | "traditional">("modern");
  const [taxType, setTaxType] = useState<"on_total" | "per_item">("on_total");
  const [taxLabel, setTaxLabel] = useState("Tax");
  const [taxRate, setTaxRate] = useState<string>("10");
  const [discountType, setDiscountType] = useState<"none" | "percentage" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState<string>("");

  // Notes / terms / parties / items
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [sender, setSender] = useState<PartyDraft>({ ...EMPTY_PARTY });
  const [recipient, setRecipient] = useState<PartyDraft>({ ...EMPTY_PARTY });
  const [items, setItems] = useState<ItemDraft[]>([{ ...EMPTY_ITEM }]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");

  const totals = useMemo(() => {
    const sub = items.reduce((acc, it) => {
      const r = Number(it.rate) || 0;
      const q = Number(it.quantity) || 0;
      return acc + r * q;
    }, 0);
    const dv = Number(discountValue) || 0;
    const disc =
      discountType === "percentage" ? sub * (dv / 100) :
      discountType === "fixed" ? dv :
      0;
    const taxable = Math.max(0, sub - disc);
    const tx = taxable * ((Number(taxRate) || 0) / 100);
    return { subtotal: sub, discount: disc, tax: tx, total: taxable + tx };
  }, [items, taxRate, discountType, discountValue]);

  function setItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((arr) => [...arr, { ...EMPTY_ITEM }]);
  }
  function removeItem(idx: number) {
    setItems((arr) => (arr.length === 1 ? arr : arr.filter((_, i) => i !== idx)));
  }

  function readAsDataUrl(file: File, setter: (url: string | null) => void) {
    const reader = new FileReader();
    reader.onload = () => setter(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }
  const handleLogoFile = (f: File) => readAsDataUrl(f, setLogoDataUrl);
  const handleSignatureFile = (f: File) => readAsDataUrl(f, setSignatureDataUrl);
  const handleFooterFile = (f: File) => readAsDataUrl(f, setFooterImageDataUrl);

  const canSubmit =
    !busy &&
    sender.name.trim().length > 0 &&
    recipient.name.trim().length > 0 &&
    items.length > 0 &&
    items.every((i) => i.description.trim() && Number(i.rate) >= 0 && Number(i.quantity) > 0);

  function buildPayload(): InvoiceGenerateInput {
    return {
      title: title.trim() || undefined,
      number: number || undefined,
      date: date || undefined,
      due_date: dueDate || undefined,
      terms: terms || undefined,
      currency,
      tax_rate: Number(taxRate) || undefined,
      tax_label: taxLabel || undefined,
      tax_type: taxType,
      discount_type: discountType === "none" ? undefined : discountType,
      discount_value: discountType === "none" ? undefined : Number(discountValue) || undefined,
      theme,
      logo_data_url: logoDataUrl ?? undefined,
      signature_data_url: signatureDataUrl ?? undefined,
      footer_image_data_url: footerImageDataUrl ?? undefined,
      notes: notes || undefined,
      sender: cleanParty(sender),
      recipient: cleanParty(recipient),
      items: items.map((it) => ({
        description: it.description.trim(),
        details: it.details.trim() || undefined,
        rate: Number(it.rate) || 0,
        quantity: Number(it.quantity) || 1,
      })),
    };
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setBusy(true);
    try {
      const inv = await generateInvoice(buildPayload());
      push({ kind: "success", title: "Invoice created", body: `${inv.filename} is ready.` });
      navigate(`/invoices/${inv.id}`, { replace: true });
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    setError(null);
    if (!canSubmit) return;
    setBusy(true);
    try {
      const inv = await generateInvoice(buildPayload());
      // Fetch the PDF as a blob (auth header required) and open it in a new
      // tab — the browser PDF viewer's Print button takes it from there.
      const token = getToken();
      const res = await fetch(`/api/invoices/${inv.id}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) {
        // Best-effort: try triggering the print dialog when the PDF loads.
        w.addEventListener("load", () => w.print());
      }
      push({ kind: "success", title: "Invoice created", body: "Opened for printing." });
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box className="page-content" sx={{ maxWidth: 1400 }}>
      {/* Top toolbar */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_e, v) => v && setView(v)}
          size="small"
        >
          <ToggleButton value="edit"><EditIcon fontSize="small" sx={{ mr: 0.5 }} />Edit</ToggleButton>
          <ToggleButton value="preview"><VisibilityIcon fontSize="small" sx={{ mr: 0.5 }} />Preview</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        <Button onClick={() => navigate(-1)} variant="text">Cancel</Button>
      </Stack>

      {view === "preview" ? (
        <PreviewPanel
          theme={theme}
          title={title}
          number={number}
          date={date}
          dueDate={dueDate}
          logoDataUrl={logoDataUrl}
          signatureDataUrl={signatureDataUrl}
          footerImageDataUrl={footerImageDataUrl}
          sender={sender}
          recipient={recipient}
          items={items}
          notes={notes}
          terms={terms}
          taxRate={taxRate}
          taxLabel={taxLabel}
          discountType={discountType}
          discountValue={discountValue}
          currency={currency}
          totals={totals}
        />
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            {/* Main content area */}
            <Grid item xs={12} md={9}>
              <Paper sx={{ p: 3, mb: 2 }}>
                <Grid container spacing={3}>
                  {/* Left column inside content: logo + From + To */}
                  <Grid item xs={12} md={6}>
                    {/* Logo upload */}
                    <Box
                      onClick={() => logoInputRef.current?.click()}
                      sx={{
                        border: "1.5px dashed",
                        borderColor: "divider",
                        borderRadius: 2,
                        p: 2,
                        textAlign: "center",
                        cursor: "pointer",
                        mb: 3,
                        transition: "border-color 0.15s",
                        "&:hover": { borderColor: "text.secondary" },
                      }}
                    >
                      {logoDataUrl ? (
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                          <Box
                            component="img"
                            src={logoDataUrl}
                            alt="Logo"
                            sx={{ maxHeight: 56, maxWidth: 160, objectFit: "contain" }}
                          />
                          <Button
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setLogoDataUrl(null); }}
                          >
                            Remove
                          </Button>
                        </Box>
                      ) : (
                        <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" sx={{ color: "text.secondary" }}>
                          <CloudUploadIcon fontSize="small" />
                          <Typography variant="body2">Add Logo</Typography>
                        </Stack>
                      )}
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleLogoFile(f);
                          e.target.value = "";
                        }}
                      />
                    </Box>

                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                      From
                    </Typography>
                    <PartyFields party={sender} onChange={setSender} placeholderName="Your Business Name" />

                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, display: "block", mt: 3 }}>
                      To
                    </Typography>
                    <PartyFields party={recipient} onChange={setRecipient} placeholderName="Client Name" />
                  </Grid>

                  {/* Right column inside content: Title / Number / Dates */}
                  <Grid item xs={12} md={6}>
                    <TextField
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Invoice"
                      inputProps={{
                        style: { fontSize: 28, fontWeight: 700, textAlign: "right", letterSpacing: "-0.02em" },
                      }}
                      sx={{ mb: 1.5 }}
                    />
                    <TextField
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="INV0001"
                      inputProps={{ style: { textAlign: "right" } }}
                      sx={{ mb: 1.5 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "right" }}>
                      Issue Date
                    </Typography>
                    <TextField
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ style: { textAlign: "right" } }}
                      sx={{ mb: 1.5 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "right" }}>
                      Due Date
                    </Typography>
                    <TextField
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ style: { textAlign: "right" } }}
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 4 }} />

                {/* Items section — single CSS Grid template shared by header + rows
                    so columns line up perfectly. On narrow screens the description
                    wraps to its own row and the right-side fields sit beside each
                    other. */}
                <Box sx={{ mb: 1 }}>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr 90px 70px 100px 32px",
                        sm: "minmax(0, 1fr) 110px 90px 120px 36px",
                      },
                      columnGap: 1.5,
                      rowGap: 1.5,
                      alignItems: "flex-start",
                    }}
                  >
                    {/* Header row */}
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Item</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Price</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Qty</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>Amount</Typography>
                    <Box />

                    {/* Full-row divider after header */}
                    <Box sx={{ gridColumn: "1 / -1", borderTop: 1, borderColor: "divider" }} />

                    {items.map((it, idx) => {
                      const amount = (Number(it.rate) || 0) * (Number(it.quantity) || 0);
                      return (
                        <RowFragment
                          key={idx}
                          item={it}
                          amount={amount}
                          currency={currency}
                          isOnly={items.length === 1}
                          onChange={(patch) => setItem(idx, patch)}
                          onRemove={() => removeItem(idx)}
                          showDivider={idx < items.length - 1}
                        />
                      );
                    })}
                  </Box>

                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={addItem}
                    sx={{ mt: 2 }}
                  >
                    Add Item
                  </Button>
                </Box>

                {/* Totals row */}
                <Box sx={{ mt: 4, ml: "auto", maxWidth: 360 }}>
                  <Stack spacing={0.75}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography color="text.secondary">Subtotal</Typography>
                      <Typography sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {currency} {totals.subtotal.toFixed(2)}
                      </Typography>
                    </Stack>
                    {totals.discount > 0 && (
                      <Stack direction="row" justifyContent="space-between">
                        <Typography color="text.secondary">Discount</Typography>
                        <Typography color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          - {currency} {totals.discount.toFixed(2)}
                        </Typography>
                      </Stack>
                    )}
                    {totals.tax > 0 && (
                      <Stack direction="row" justifyContent="space-between">
                        <Typography color="text.secondary">{taxLabel} ({taxRate}%)</Typography>
                        <Typography color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {currency} {totals.tax.toFixed(2)}
                        </Typography>
                      </Stack>
                    )}
                    <Divider />
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ fontWeight: 700, fontSize: 18 }}>Total</Typography>
                      <Typography sx={{ fontWeight: 700, fontSize: 18, fontVariantNumeric: "tabular-nums" }}>
                        {currency} {totals.total.toFixed(2)}
                      </Typography>
                    </Stack>
                  </Stack>
                </Box>
              </Paper>

              {/* Notes & terms */}
              <Paper sx={{ p: 3, mb: 2 }}>
                <Stack spacing={3}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                      Notes
                    </Typography>
                    <TextField
                      placeholder="Thank you for your business!"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      multiline
                      minRows={2}
                    />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                      Terms &amp; Conditions
                    </Typography>
                    <TextField
                      placeholder="Payment terms…"
                      value={terms}
                      onChange={(e) => setTerms(e.target.value)}
                      multiline
                      minRows={2}
                    />
                  </Box>
                </Stack>
              </Paper>

              {/* Signature + footer image */}
              <Paper sx={{ p: 3, mb: 2 }}>
                <Stack spacing={2.5}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 1 }}>
                      Signature
                    </Typography>
                    {signatureDataUrl ? (
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box
                          component="img"
                          src={signatureDataUrl}
                          alt="Signature"
                          sx={{
                            height: 64,
                            maxWidth: 240,
                            objectFit: "contain",
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 1,
                            p: 0.5,
                            bgcolor: "background.default",
                          }}
                        />
                        <Button size="small" onClick={() => setSignatureDataUrl(null)}>
                          Remove
                        </Button>
                      </Stack>
                    ) : (
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Button
                          variant="outlined"
                          startIcon={<CreateIcon />}
                          onClick={() => setSignatureOpen(true)}
                          sx={{ borderStyle: "dashed" }}
                        >
                          Draw Signature
                        </Button>
                        <Typography variant="caption" color="text.secondary">or</Typography>
                        <Button
                          variant="outlined"
                          startIcon={<CloudUploadIcon />}
                          onClick={() => signatureInputRef.current?.click()}
                          sx={{ borderStyle: "dashed" }}
                        >
                          Upload
                        </Button>
                        <input
                          ref={signatureInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleSignatureFile(f);
                            e.target.value = "";
                          }}
                        />
                      </Stack>
                    )}
                  </Box>

                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 1 }}>
                      Footer image
                    </Typography>
                    {footerImageDataUrl ? (
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box
                          component="img"
                          src={footerImageDataUrl}
                          alt="Footer"
                          sx={{
                            height: 56,
                            maxWidth: 360,
                            objectFit: "contain",
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 1,
                            p: 0.5,
                            bgcolor: "background.default",
                          }}
                        />
                        <Button size="small" onClick={() => setFooterImageDataUrl(null)}>
                          Remove
                        </Button>
                      </Stack>
                    ) : (
                      <>
                        <Button
                          variant="outlined"
                          startIcon={<ImageOutlinedIcon />}
                          onClick={() => footerInputRef.current?.click()}
                          sx={{ borderStyle: "dashed" }}
                        >
                          Add Footer Image
                        </Button>
                        <input
                          ref={footerInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFooterFile(f);
                            e.target.value = "";
                          }}
                        />
                      </>
                    )}
                  </Box>
                </Stack>
              </Paper>

              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            </Grid>

            {/* Right sidebar */}
            <Grid item xs={12} md={3}>
              <Paper
                sx={{
                  p: 2.5,
                  position: { md: "sticky" },
                  top: { md: 80 },
                }}
              >
                <Stack spacing={1.5}>
                  <Button
                    variant="contained"
                    color="primary"
                    fullWidth
                    startIcon={<CloudUploadIcon />}
                    disabled={!canSubmit}
                    onClick={() => handleSubmit()}
                  >
                    {busy ? "Generating…" : "Generate PDF"}
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    startIcon={<PrintIcon />}
                    disabled={!canSubmit}
                    onClick={handlePrint}
                  >
                    Print
                  </Button>
                  <Divider sx={{ my: 1 }} />

                  <TextField
                    select
                    label="Currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                  </TextField>

                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      display: "flex",
                      gap: 1,
                      alignItems: "flex-start",
                      bgcolor: "action.hover",
                      borderRadius: 2,
                    }}
                  >
                    <LightbulbOutlinedIcon fontSize="small" color="primary" />
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
                        Quick Tip
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Most fields are optional. Click <strong>Preview</strong> at the top to see the
                        final result before generating the PDF.
                      </Typography>
                    </Box>
                  </Paper>

                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                      Invoice Theme
                    </Typography>
                    <ToggleButtonGroup
                      value={theme}
                      exclusive
                      onChange={(_e, v) => v && setTheme(v)}
                      size="small"
                      fullWidth
                    >
                      <ToggleButton value="modern">Modern</ToggleButton>
                      <ToggleButton value="traditional">Traditional</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                      Tax
                    </Typography>
                    <Stack spacing={1}>
                      <TextField
                        select
                        size="small"
                        value={taxType}
                        onChange={(e) => setTaxType(e.target.value as typeof taxType)}
                      >
                        <MenuItem value="on_total">On Total</MenuItem>
                        <MenuItem value="per_item">Per Item</MenuItem>
                      </TextField>
                      <TextField
                        size="small"
                        placeholder="Tax"
                        value={taxLabel}
                        onChange={(e) => setTaxLabel(e.target.value)}
                      />
                      <TextField
                        size="small"
                        type="number"
                        inputProps={{ min: 0, max: 100, step: "0.01" }}
                        placeholder="0"
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                      />
                    </Stack>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                      Discount
                    </Typography>
                    <Stack spacing={1}>
                      <TextField
                        select
                        size="small"
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as typeof discountType)}
                      >
                        <MenuItem value="none">No Discount</MenuItem>
                        <MenuItem value="percentage">Percentage (%)</MenuItem>
                        <MenuItem value="fixed">Fixed amount</MenuItem>
                      </TextField>
                      {discountType !== "none" && (
                        <TextField
                          size="small"
                          type="number"
                          inputProps={{ min: 0, step: "0.01" }}
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          placeholder={discountType === "percentage" ? "e.g. 10" : "e.g. 50"}
                        />
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      )}

      <SignaturePad
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onSave={(url) => setSignatureDataUrl(url)}
      />
    </Box>
  );
}

/** One line-item row rendered as a fragment so it shares the parent CSS grid. */
function RowFragment({
  item,
  amount,
  currency,
  isOnly,
  onChange,
  onRemove,
  showDivider,
}: {
  item: ItemDraft;
  amount: number;
  currency: string;
  isOnly: boolean;
  onChange: (patch: Partial<ItemDraft>) => void;
  onRemove: () => void;
  showDivider: boolean;
}) {
  return (
    <>
      <Stack spacing={1}>
        <TextField
          placeholder="Item name"
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          required
        />
        <TextField
          placeholder="Item description (optional)"
          value={item.details}
          onChange={(e) => onChange({ details: e.target.value })}
        />
      </Stack>
      <TextField
        type="number"
        inputProps={{ min: 0, step: "0.01" }}
        value={item.rate}
        onChange={(e) => onChange({ rate: e.target.value })}
        required
      />
      <TextField
        type="number"
        inputProps={{ min: 0.01, step: "0.01" }}
        value={item.quantity}
        onChange={(e) => onChange({ quantity: e.target.value })}
        required
      />
      <Box sx={{ textAlign: "right", py: 1, pr: 0.5 }}>
        <Typography sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {currency} {amount.toFixed(2)}
        </Typography>
      </Box>
      <IconButton
        aria-label="Remove item"
        onClick={onRemove}
        disabled={isOnly}
        size="small"
        sx={{ alignSelf: "center", justifySelf: "center" }}
      >
        <DeleteIcon fontSize="small" />
      </IconButton>
      {showDivider && (
        <Box sx={{ gridColumn: "1 / -1", borderTop: 1, borderColor: "divider" }} />
      )}
    </>
  );
}

function PartyFields({
  party,
  onChange,
  placeholderName,
}: {
  party: PartyDraft;
  onChange: (p: PartyDraft) => void;
  placeholderName?: string;
}) {
  function set(patch: Partial<PartyDraft>) { onChange({ ...party, ...patch }); }
  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      <TextField placeholder={placeholderName ?? "Name"} value={party.name} onChange={(e) => set({ name: e.target.value })} required />
      <TextField placeholder="email@business.com" type="email" value={party.email} onChange={(e) => set({ email: e.target.value })} />
      <TextField placeholder="Street Address" value={party.address} onChange={(e) => set({ address: e.target.value })} />
      <TextField placeholder="City, State ZIP" value={party.city} onChange={(e) => set({ city: e.target.value })} />
      <TextField placeholder="(123) 456-7890" value={party.phone} onChange={(e) => set({ phone: e.target.value })} />
      <TextField placeholder="Tax ID / GST #" value={party.tax_id} onChange={(e) => set({ tax_id: e.target.value })} />
    </Stack>
  );
}

function cleanParty(p: PartyDraft) {
  const out: Record<string, string> = { name: p.name.trim() };
  for (const [k, v] of Object.entries(p)) {
    if (k !== "name" && v.trim()) out[k] = v.trim();
  }
  return out as { name: string } & Partial<Record<keyof PartyDraft, string>>;
}

// ---------------------------------------------------------------------------
// Read-only preview rendering — mimics the PDF look so the user can verify
// before clicking Generate. Pure presentational, no API calls.
// ---------------------------------------------------------------------------

interface PreviewProps {
  theme: "modern" | "traditional";
  title: string;
  number: string;
  date: string;
  dueDate: string;
  logoDataUrl: string | null;
  signatureDataUrl: string | null;
  footerImageDataUrl: string | null;
  sender: PartyDraft;
  recipient: PartyDraft;
  items: ItemDraft[];
  notes: string;
  terms: string;
  taxRate: string;
  taxLabel: string;
  discountType: "none" | "percentage" | "fixed";
  discountValue: string;
  currency: string;
  totals: { subtotal: number; discount: number; tax: number; total: number };
}

/**
 * Preview rendered as an A4-ish "sheet" of paper — white background, dark text,
 * fixed max-width and minimum height, drop shadow. Toggling between Edit and
 * Preview keeps content in the same physical positions.
 *
 * Two themes are supported. Modern keeps the sans-serif editorial look (matches
 * the rest of the app). Traditional switches to a serif body, a centred upper-
 * case title with a heavy underline, and a bordered grid for the items table —
 * the kind of letterhead-style invoice accountants are used to.
 */
function PreviewPanel(p: PreviewProps) {
  const isTrad = p.theme === "traditional";

  // Paper-like sheet: always white, ignores app dark mode so what you see is
  // what gets printed. ~800px wide ≈ A4 at 96 DPI; min-height keeps short
  // invoices looking like a page.
  const sheetSx = {
    width: "100%",
    maxWidth: 820,
    mx: "auto",
    bgcolor: "#ffffff",
    color: "#171615",
    boxShadow: "0 12px 40px -10px rgba(15, 18, 30, 0.35)",
    borderRadius: 1.5,
    p: { xs: 4, md: 7 },
    minHeight: { xs: "auto", md: 1100 },
    fontFamily: isTrad ? '"Georgia", "Times New Roman", serif' : "inherit",
  } as const;

  if (isTrad) {
    return (
      <Paper sx={sheetSx}>
        {/* Centred uppercase title with double underline — letterhead style. */}
        <Box sx={{ textAlign: "center", mb: 4 }}>
          {p.logoDataUrl && (
            <Box component="img" src={p.logoDataUrl} alt="Logo"
              sx={{ maxHeight: 64, maxWidth: 220, objectFit: "contain", mb: 2, display: "inline-block" }} />
          )}
          <Typography
            sx={{
              fontFamily: 'inherit',
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#171615",
            }}
          >
            {p.title || "Invoice"}
          </Typography>
          <Box sx={{ borderTop: "3px double #171615", mt: 1.5, mx: "auto", width: "60%" }} />
        </Box>

        {/* Meta row spanning full width */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          spacing={1}
          sx={{ mb: 3, fontStyle: "italic" }}
        >
          {p.number && <Typography>No.&nbsp; {p.number}</Typography>}
          {p.date && <Typography>Issue Date:&nbsp; {p.date}</Typography>}
          {p.dueDate && <Typography>Due Date:&nbsp; {p.dueDate}</Typography>}
        </Stack>

        {/* From / To with dividers between */}
        <Grid container sx={{ borderTop: 1, borderBottom: 1, borderColor: "#171615", py: 2, mb: 3 }}>
          <Grid item xs={12} sm={6} sx={{ pr: 2 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 12, textDecoration: "underline", mb: 0.5 }}>From</Typography>
            <PreviewParty party={p.sender} bold />
          </Grid>
          <Grid item xs={12} sm={6} sx={{ pl: 2, borderLeft: { sm: 1 }, borderColor: { sm: "#d6d2c8" } }}>
            <Typography sx={{ fontWeight: 700, fontSize: 12, textDecoration: "underline", mb: 0.5 }}>Bill To</Typography>
            <PreviewParty party={p.recipient} bold />
          </Grid>
        </Grid>

        {/* Bordered items table */}
        <Box
          sx={{
            border: 1,
            borderColor: "#171615",
            "& .traditional-row": {
              display: "grid",
              gridTemplateColumns: "1fr 110px 80px 110px",
              "& > *": {
                borderRight: 1,
                borderColor: "#d6d2c8",
                p: 1.25,
              },
              "& > *:last-child": { borderRight: 0 },
            },
            "& .traditional-row + .traditional-row": {
              borderTop: 1,
              borderColor: "#d6d2c8",
            },
          }}
        >
          <Box className="traditional-row" sx={{ bgcolor: "#171615", color: "#fff", "& > *": { color: "#fff", fontWeight: 700, fontSize: 13 } }}>
            <Box>Description</Box>
            <Box sx={{ textAlign: "right" }}>Rate</Box>
            <Box sx={{ textAlign: "right" }}>Qty</Box>
            <Box sx={{ textAlign: "right" }}>Amount</Box>
          </Box>
          {p.items.map((it, i) => {
            const amount = (Number(it.rate) || 0) * (Number(it.quantity) || 0);
            return (
              <Box className="traditional-row" key={i}>
                <Box>
                  <Typography sx={{ fontFamily: 'inherit' }}>{it.description || "—"}</Typography>
                  {it.details && <Typography sx={{ fontFamily: 'inherit', fontSize: 12, fontStyle: "italic", color: "#5b5750" }}>{it.details}</Typography>}
                </Box>
                <Box sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.currency} {(Number(it.rate) || 0).toFixed(2)}</Box>
                <Box sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Number(it.quantity) || 0}</Box>
                <Box sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.currency} {amount.toFixed(2)}</Box>
              </Box>
            );
          })}
        </Box>

        <Box sx={{ mt: 3, ml: "auto", maxWidth: 360 }}>
          <PreviewTotals p={p} bold />
        </Box>

        {(p.notes || p.terms) && (
          <Stack spacing={2} sx={{ mt: 4, borderTop: 1, borderColor: "#171615", pt: 2 }}>
            {p.notes && (
              <Box>
                <Typography sx={{ fontWeight: 700, fontStyle: "italic", textDecoration: "underline" }}>Notes</Typography>
                <Typography sx={{ mt: 0.5 }}>{p.notes}</Typography>
              </Box>
            )}
            {p.terms && (
              <Box>
                <Typography sx={{ fontWeight: 700, fontStyle: "italic", textDecoration: "underline" }}>Terms &amp; Conditions</Typography>
                <Typography sx={{ mt: 0.5 }}>{p.terms}</Typography>
              </Box>
            )}
          </Stack>
        )}

        {p.signatureDataUrl && (
          <Box sx={{ mt: 4 }}>
            <Typography sx={{ fontWeight: 700, fontStyle: "italic", textDecoration: "underline", mb: 1 }}>Signature</Typography>
            <Box
              component="img"
              src={p.signatureDataUrl}
              alt="Signature"
              sx={{ maxHeight: 90, maxWidth: 260, objectFit: "contain", borderBottom: 1, borderColor: "#171615", pb: 0.5, display: "block" }}
            />
          </Box>
        )}

        {p.footerImageDataUrl && (
          <Box sx={{ mt: 4, borderTop: 1, borderColor: "#171615", pt: 2 }}>
            <Box component="img" src={p.footerImageDataUrl} alt="Footer"
              sx={{ width: "100%", maxHeight: 120, objectFit: "contain", display: "block" }} />
          </Box>
        )}
      </Paper>
    );
  }

  // ----- Modern theme (default) — matches the Edit form spatial layout. -----
  return (
    <Paper sx={sheetSx}>
      <Grid container spacing={3} alignItems="flex-start">
        <Grid item xs={12} md={6}>
          {p.logoDataUrl ? (
            <Box component="img" src={p.logoDataUrl} alt="Logo"
              sx={{ maxHeight: 56, maxWidth: 200, objectFit: "contain", mb: 3, display: "block" }} />
          ) : (
            <Box sx={{ height: 56, mb: 3 }} />
          )}
          <Typography sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, fontSize: 11, color: "#5b5750", display: "block" }}>
            From
          </Typography>
          <PreviewParty party={p.sender} />
          <Typography sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, fontSize: 11, color: "#5b5750", display: "block", mt: 3 }}>
            Bill to
          </Typography>
          <PreviewParty party={p.recipient} />
        </Grid>

        <Grid item xs={12} md={6}>
          <Box sx={{ textAlign: "right" }}>
            <Typography sx={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {p.title || "Invoice"}
            </Typography>
            <Typography sx={{ mt: 1, color: "#5b5750", fontVariantNumeric: "tabular-nums" }}>
              {p.number || "—"}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <PreviewMetaRight label="Issue Date" value={p.date} />
              <PreviewMetaRight label="Due Date" value={p.dueDate} />
            </Box>
          </Box>
        </Grid>
      </Grid>

      <Box sx={{ borderTop: 1, borderColor: "#d6d2c8", my: 3 }} />

      <Box>
        <Grid container sx={{ borderBottom: "2px solid #171615", pb: 1, mb: 1 }}>
          <Grid item xs={6}>
            <Typography sx={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>Description</Typography>
          </Grid>
          <Grid item xs={2} sx={{ textAlign: "right" }}>
            <Typography sx={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rate</Typography>
          </Grid>
          <Grid item xs={2} sx={{ textAlign: "right" }}>
            <Typography sx={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>Qty</Typography>
          </Grid>
          <Grid item xs={2} sx={{ textAlign: "right" }}>
            <Typography sx={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>Amount</Typography>
          </Grid>
        </Grid>
        {p.items.map((it, i) => {
          const amount = (Number(it.rate) || 0) * (Number(it.quantity) || 0);
          return (
            <Grid container key={i} spacing={1} sx={{ py: 1.25, borderBottom: "1px solid #ebe7dc" }}>
              <Grid item xs={6}>
                <Typography>{it.description || "—"}</Typography>
                {it.details && <Typography sx={{ fontSize: 12, color: "#5b5750" }}>{it.details}</Typography>}
              </Grid>
              <Grid item xs={2} sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                <Typography>{p.currency} {(Number(it.rate) || 0).toFixed(2)}</Typography>
              </Grid>
              <Grid item xs={2} sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                <Typography>{Number(it.quantity) || 0}</Typography>
              </Grid>
              <Grid item xs={2} sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                <Typography>{p.currency} {amount.toFixed(2)}</Typography>
              </Grid>
            </Grid>
          );
        })}
      </Box>

      <Box sx={{ mt: 3, ml: "auto", maxWidth: 360 }}>
        <PreviewTotals p={p} />
      </Box>

      {p.notes && (
        <Box sx={{ mt: 4 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5b5750" }}>
            Notes
          </Typography>
          <Typography sx={{ mt: 0.5, color: "#5b5750" }}>{p.notes}</Typography>
        </Box>
      )}
      {p.terms && (
        <Box sx={{ mt: 3 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5b5750" }}>
            Terms &amp; Conditions
          </Typography>
          <Typography sx={{ mt: 0.5, color: "#5b5750" }}>{p.terms}</Typography>
        </Box>
      )}

      {p.signatureDataUrl && (
        <Box sx={{ mt: 4 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5b5750", display: "block", mb: 1 }}>
            Signature
          </Typography>
          <Box component="img" src={p.signatureDataUrl} alt="Signature"
            sx={{ maxHeight: 80, maxWidth: 240, objectFit: "contain", borderBottom: "1px solid #171615", pb: 0.5, display: "block" }} />
        </Box>
      )}

      {p.footerImageDataUrl && (
        <Box sx={{ mt: 4 }}>
          <Box component="img" src={p.footerImageDataUrl} alt="Footer"
            sx={{ width: "100%", maxHeight: 120, objectFit: "contain", display: "block" }} />
        </Box>
      )}
    </Paper>
  );
}

function PreviewTotals({ p, bold }: { p: PreviewProps; bold?: boolean }) {
  return (
    <Stack spacing={0.75}>
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ color: "#5b5750", fontWeight: bold ? 600 : 400 }}>Subtotal</Typography>
        <Typography sx={{ fontVariantNumeric: "tabular-nums" }}>{p.currency} {p.totals.subtotal.toFixed(2)}</Typography>
      </Stack>
      {p.totals.discount > 0 && (
        <Stack direction="row" justifyContent="space-between">
          <Typography sx={{ color: "#5b5750" }}>
            Discount{p.discountType === "percentage" ? ` (${p.discountValue}%)` : ""}
          </Typography>
          <Typography sx={{ fontVariantNumeric: "tabular-nums" }}>- {p.currency} {p.totals.discount.toFixed(2)}</Typography>
        </Stack>
      )}
      {p.totals.tax > 0 && (
        <Stack direction="row" justifyContent="space-between">
          <Typography sx={{ color: "#5b5750" }}>{p.taxLabel || "Tax"} ({p.taxRate}%)</Typography>
          <Typography sx={{ fontVariantNumeric: "tabular-nums" }}>{p.currency} {p.totals.tax.toFixed(2)}</Typography>
        </Stack>
      )}
      <Box sx={{ borderTop: "1px solid #171615", my: 0.5 }} />
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Total</Typography>
        <Typography sx={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
          {p.currency} {p.totals.total.toFixed(2)}
        </Typography>
      </Stack>
    </Stack>
  );
}

function PreviewMetaRight({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <Box sx={{ mb: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
    </Box>
  );
}

function PreviewParty({ party, bold }: { party: PartyDraft; bold?: boolean }) {
  const muted = bold ? "#171615" : "#5b5750";
  return (
    <Box sx={{ mt: 0.75 }}>
      <Typography sx={{ fontWeight: 700 }}>{party.name || "—"}</Typography>
      {party.email && <Typography sx={{ fontSize: 14, color: muted }}>{party.email}</Typography>}
      {party.address && <Typography sx={{ fontSize: 14, color: muted }}>{party.address}</Typography>}
      {party.city && <Typography sx={{ fontSize: 14, color: muted }}>{party.city}</Typography>}
      {party.phone && <Typography sx={{ fontSize: 14, color: muted }}>{party.phone}</Typography>}
      {party.tax_id && <Typography sx={{ fontSize: 14, color: muted }}>Tax ID: {party.tax_id}</Typography>}
    </Box>
  );
}
