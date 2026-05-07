"""Render an invoice form payload as a clean, print-ready PDF.

Two themes:
  - "modern" (default): sans-serif, right-aligned title block, minimal table
    (just bottom borders), editorial vibe.
  - "traditional": serif, centred title with double underline, fully-bordered
    items table, dark header row — the letterhead-style form accountants are
    used to.

Both use ReportLab Platypus on Letter-size paper. Logos, signatures, and
footer images can be embedded via base64 data URLs.
"""
from __future__ import annotations

import base64
import io
import logging
import re
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)

# Editorial palette — matches the frontend monochrome theme.
INK = colors.HexColor("#171615")
INK_MUTED = colors.HexColor("#5b5750")
RULE = colors.HexColor("#d6d2c8")


def _styles(theme: str) -> dict[str, ParagraphStyle]:
    """Build paragraph styles per theme. Modern = Helvetica, traditional = Times."""
    base = getSampleStyleSheet()
    is_trad = theme == "traditional"
    body_font = "Times-Roman" if is_trad else "Helvetica"
    bold_font = "Times-Bold" if is_trad else "Helvetica-Bold"
    italic_font = "Times-Italic" if is_trad else "Helvetica-Oblique"
    return {
        "title": ParagraphStyle(
            "title", parent=base["Heading1"],
            fontName=bold_font, fontSize=32, leading=36,
            textColor=INK, spaceAfter=4,
        ),
        "title_center": ParagraphStyle(
            "title_center", parent=base["Heading1"],
            fontName=bold_font, fontSize=34, leading=38,
            textColor=INK, alignment=1,
            # Tracked-out caps look "letterhead-y"; ReportLab honours the literal spaces.
        ),
        "label": ParagraphStyle(
            "label", parent=base["Normal"],
            fontName=bold_font, fontSize=8, leading=10,
            textColor=INK_MUTED, spaceAfter=2,
        ),
        "label_underline": ParagraphStyle(
            "label_underline", parent=base["Normal"],
            fontName=bold_font, fontSize=10, leading=12,
            textColor=INK, spaceAfter=4, underlineWidth=0.6,
        ),
        "value": ParagraphStyle(
            "value", parent=base["Normal"],
            fontName=body_font, fontSize=10, leading=13,
            textColor=INK,
        ),
        "value_b": ParagraphStyle(
            "value_b", parent=base["Normal"],
            fontName=bold_font, fontSize=11, leading=14,
            textColor=INK,
        ),
        "muted": ParagraphStyle(
            "muted", parent=base["Normal"],
            fontName=body_font, fontSize=9, leading=12,
            textColor=INK_MUTED,
        ),
        "italic": ParagraphStyle(
            "italic", parent=base["Normal"],
            fontName=italic_font, fontSize=10, leading=13,
            textColor=INK,
        ),
        "right": ParagraphStyle(
            "right", parent=base["Normal"],
            fontName=body_font, fontSize=10, leading=13,
            textColor=INK, alignment=2,
        ),
        "right_b": ParagraphStyle(
            "right_b", parent=base["Normal"],
            fontName=bold_font, fontSize=12, leading=15,
            textColor=INK, alignment=2,
        ),
        "header_white": ParagraphStyle(
            "header_white", parent=base["Normal"],
            fontName=bold_font, fontSize=10, leading=12,
            textColor=colors.white,
        ),
        "header_white_right": ParagraphStyle(
            "header_white_right", parent=base["Normal"],
            fontName=bold_font, fontSize=10, leading=12,
            textColor=colors.white, alignment=2,
        ),
    }


def _money(amount: float, currency: str | None) -> str:
    cur = (currency or "USD").upper()
    return f"{cur} {amount:,.2f}"


def _logo_flowable(data_url: str | None, max_w: float, max_h: float) -> Image | None:
    """Decode a data: URL to a Reportlab Image, sized to fit a bounding box.

    Returns None if the URL is missing/malformed or the image library can't read it.
    Failures are logged and swallowed so an invalid logo doesn't break the whole PDF.
    """
    if not data_url:
        return None
    m = re.match(r"^data:[^;]+;base64,(.+)$", data_url, flags=re.DOTALL)
    if not m:
        return None
    try:
        raw = base64.b64decode(m.group(1))
        img = Image(io.BytesIO(raw))
        ratio = min(max_w / img.imageWidth, max_h / img.imageHeight, 1.0)
        img.drawWidth = img.imageWidth * ratio
        img.drawHeight = img.imageHeight * ratio
        return img
    except Exception as e:  # noqa: BLE001
        logger.warning("invalid logo data URL: %s", e)
        return None


def _contact_block(party: dict[str, Any], styles: dict[str, ParagraphStyle]) -> list:
    flowables: list = []
    name = party.get("name") or "—"
    flowables.append(Paragraph(name, styles["value_b"]))
    for key in ("email", "address", "city", "phone", "tax_id", "taxId"):
        v = party.get(key)
        if v:
            flowables.append(Paragraph(str(v), styles["value"]))
    return flowables


def _compute_totals(items: list[dict[str, Any]], tax_rate: float | None,
                    discount_type: str | None, discount_value: float | None) -> tuple[float, float, float, float]:
    subtotal = 0.0
    for it in items:
        rate = float(it.get("rate") or 0)
        qty = float(it.get("quantity") or 1)
        subtotal += rate * qty

    discount = 0.0
    if discount_type == "percentage" and discount_value:
        discount = subtotal * (float(discount_value) / 100.0)
    elif discount_type == "fixed" and discount_value:
        discount = float(discount_value)

    taxable = max(0.0, subtotal - discount)
    tax = taxable * (float(tax_rate or 0) / 100.0)
    total = taxable + tax
    return subtotal, discount, tax, total


def _build_modern_header(req: dict[str, Any], styles: dict[str, ParagraphStyle], doc_width: float, title_text: str) -> list:
    """Modern theme header: title-left + meta-right, thin rule below."""
    story: list = []
    meta_rows = []
    if req.get("number"):
        meta_rows.append([Paragraph(f"{title_text.upper()} NUMBER", styles["label"]),
                          Paragraph(str(req["number"]), styles["value"])])
    if req.get("date"):
        meta_rows.append([Paragraph("ISSUE DATE", styles["label"]),
                          Paragraph(str(req["date"]), styles["value"])])
    if req.get("due_date") or req.get("dueDate"):
        meta_rows.append([Paragraph("DUE DATE", styles["label"]),
                          Paragraph(str(req.get("due_date") or req.get("dueDate")), styles["value"])])
    if req.get("terms"):
        meta_rows.append([Paragraph("TERMS", styles["label"]),
                          Paragraph(str(req["terms"]), styles["value"])])
    meta_table = Table(meta_rows, colWidths=[35 * mm, 50 * mm]) if meta_rows else Spacer(1, 0)
    if meta_rows:
        meta_table.setStyle(TableStyle([
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))

    logo = _logo_flowable(req.get("logo_data_url") or req.get("logoDataUrl"),
                          max_w=40 * mm, max_h=20 * mm)
    title_flow = Paragraph(title_text, styles["title"])
    left_cell: Any = [logo, Spacer(1, 4 * mm), title_flow] if logo is not None else title_flow

    header = Table([[left_cell, meta_table]], colWidths=[None, 90 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header)
    story.append(Spacer(1, 4 * mm))
    story.append(Table([[""]], colWidths=[doc_width], rowHeights=[1],
                       style=TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.5, RULE)])))
    story.append(Spacer(1, 6 * mm))
    return story


def _build_traditional_header(req: dict[str, Any], styles: dict[str, ParagraphStyle], doc_width: float, title_text: str) -> list:
    """Traditional theme header: centred logo + uppercase title with double underline + italic meta row."""
    story: list = []

    logo = _logo_flowable(req.get("logo_data_url") or req.get("logoDataUrl"),
                          max_w=50 * mm, max_h=20 * mm)
    if logo is not None:
        # Centre the logo via a table with a single centred cell.
        logo_t = Table([[logo]], colWidths=[doc_width])
        logo_t.setStyle(TableStyle([
            ("ALIGN", (0, 0), (0, 0), "CENTER"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(logo_t)
        story.append(Spacer(1, 3 * mm))

    # Centred uppercase title (Paragraph wraps a single line).
    centred_title = Paragraph(title_text.upper(), styles["title_center"])
    story.append(centred_title)

    # Double-rule under the title — two thin lines stacked, centred at 60% width.
    rule_w = doc_width * 0.6
    pad = (doc_width - rule_w) / 2
    rule = Table([[""]], colWidths=[rule_w], rowHeights=[1])
    rule.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 1.5, INK),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, INK),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    rule_holder = Table([[Spacer(1, 0), rule, Spacer(1, 0)]],
                        colWidths=[pad, rule_w, pad])
    rule_holder.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(Spacer(1, 2 * mm))
    story.append(rule_holder)
    story.append(Spacer(1, 5 * mm))

    # Italic meta row (No. / Issue Date / Due Date)
    meta_cells: list = []
    if req.get("number"):
        meta_cells.append(Paragraph(f"<i>No.</i> &nbsp; {req['number']}", styles["italic"]))
    if req.get("date"):
        meta_cells.append(Paragraph(f"<i>Issue Date:</i> &nbsp; {req['date']}", styles["italic"]))
    if req.get("due_date") or req.get("dueDate"):
        meta_cells.append(Paragraph(f"<i>Due Date:</i> &nbsp; {req.get('due_date') or req.get('dueDate')}", styles["italic"]))
    if meta_cells:
        col_w = doc_width / max(1, len(meta_cells))
        meta = Table([meta_cells], colWidths=[col_w] * len(meta_cells))
        meta.setStyle(TableStyle([
            ("ALIGN", (0, 0), (0, 0), "LEFT"),
            ("ALIGN", (-1, 0), (-1, 0), "RIGHT"),
            ("ALIGN", (1, 0), (-2, 0), "CENTER"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(meta)
        story.append(Spacer(1, 6 * mm))

    return story


def generate_invoice_pdf(req: dict[str, Any], out_path: str) -> None:
    """Render `req` (matches InvoiceGenerateRequest) to `out_path` as a PDF."""
    theme = (req.get("theme") or "modern").lower()
    is_trad = theme == "traditional"
    styles = _styles(theme)

    margin = 18 * mm
    title_text = req.get("title") or "Invoice"
    doc = SimpleDocTemplate(
        out_path,
        pagesize=LETTER,
        leftMargin=margin, rightMargin=margin,
        topMargin=margin, bottomMargin=margin,
        title=f"{title_text} {req.get('number') or ''}".strip(),
        author=(req.get("from") or {}).get("name", ""),
    )

    story: list = []

    if is_trad:
        story.extend(_build_traditional_header(req, styles, doc.width, title_text))
    else:
        story.extend(_build_modern_header(req, styles, doc.width, title_text))

    # --- From / To columns (consistent across themes) ---
    sender = req.get("from") or {}
    recipient = req.get("to") or {}
    from_label = "From" if is_trad else "FROM"
    to_label = "Bill To" if is_trad else "BILL TO"
    label_style = styles["label_underline"] if is_trad else styles["label"]
    from_block = [Paragraph(from_label, label_style)] + _contact_block(sender, styles)
    to_block = [Paragraph(to_label, label_style)] + _contact_block(recipient, styles)
    parties = Table([[from_block, to_block]], colWidths=[(doc.width - 8 * mm) / 2] * 2)
    parties_style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]
    if is_trad:
        # Boxed by horizontal rules above and below.
        parties_style.extend([
            ("LINEABOVE", (0, 0), (-1, 0), 0.6, INK),
            ("LINEBELOW", (0, 0), (-1, -1), 0.6, INK),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (1, 0), (1, 0), 6),
        ])
    parties.setStyle(TableStyle(parties_style))
    story.append(parties)
    story.append(Spacer(1, 8 * mm))

    # --- Items table ---
    items = req.get("items") or []
    currency = req.get("currency") or "USD"

    if is_trad:
        head = [
            Paragraph("DESCRIPTION", styles["header_white"]),
            Paragraph("RATE", styles["header_white_right"]),
            Paragraph("QTY", styles["header_white_right"]),
            Paragraph("AMOUNT", styles["header_white_right"]),
        ]
    else:
        head = [
            Paragraph("DESCRIPTION", styles["label"]),
            Paragraph("RATE", styles["label"]),
            Paragraph("QTY", styles["label"]),
            Paragraph("AMOUNT", styles["label"]),
        ]
    rows: list[list] = [head]
    for it in items:
        desc = str(it.get("description") or "")
        details = it.get("details")
        if details:
            desc_para = Paragraph(
                f"{desc}<br/><font color='#5b5750' size='8'><i>{details}</i></font>"
                if is_trad else
                f"{desc}<br/><font color='#5b5750' size='8'>{details}</font>",
                styles["value"],
            )
        else:
            desc_para = Paragraph(desc, styles["value"])
        rate = float(it.get("rate") or 0)
        qty = float(it.get("quantity") or 1)
        amount = rate * qty
        rows.append([
            desc_para,
            Paragraph(_money(rate, currency), styles["right"]),
            Paragraph(f"{qty:g}", styles["right"]),
            Paragraph(_money(amount, currency), styles["right"]),
        ])

    items_table = Table(rows, colWidths=[
        doc.width - (35 * mm + 18 * mm + 30 * mm),
        35 * mm, 18 * mm, 30 * mm,
    ])

    if is_trad:
        items_table.setStyle(TableStyle([
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("BOX", (0, 0), (-1, -1), 0.6, INK),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, RULE),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, INK),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
    else:
        items_table.setStyle(TableStyle([
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, INK),
            ("LINEBELOW", (0, 1), (-1, -1), 0.3, RULE),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
            ("TOPPADDING", (0, 1), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
    story.append(items_table)
    story.append(Spacer(1, 6 * mm))

    # --- Totals (right-aligned, same in both themes) ---
    subtotal, discount, tax, total = _compute_totals(
        items,
        req.get("tax_rate") or req.get("taxRate"),
        req.get("discount_type") or req.get("discountType"),
        req.get("discount_value") or req.get("discountValue"),
    )

    tax_label = req.get("tax_label") or req.get("taxLabel") or "Tax"
    tax_rate_pct = req.get("tax_rate") or req.get("taxRate") or 0

    totals_rows = [
        ["", Paragraph("Subtotal", styles["right"]), Paragraph(_money(subtotal, currency), styles["right"])],
    ]
    if discount:
        dt = req.get("discount_type") or req.get("discountType")
        dv = req.get("discount_value") or req.get("discountValue")
        label = "Discount"
        if dt == "percentage":
            label = f"Discount ({dv}%)"
        totals_rows.append(["", Paragraph(label, styles["right"]),
                            Paragraph("- " + _money(discount, currency), styles["right"])])
    if tax_rate_pct:
        totals_rows.append(["", Paragraph(f"{tax_label} ({tax_rate_pct}%)", styles["right"]),
                            Paragraph(_money(tax, currency), styles["right"])])
    totals_rows.append(["", Paragraph("Total", styles["right_b"]),
                        Paragraph(_money(total, currency), styles["right_b"])])

    totals_table = Table(totals_rows, colWidths=[
        doc.width - (50 * mm + 35 * mm), 50 * mm, 35 * mm,
    ])
    totals_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEABOVE", (1, -1), (-1, -1), 0.6, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(totals_table)

    # --- Notes ---
    if req.get("notes"):
        story.append(Spacer(1, 10 * mm))
        story.append(Paragraph("Notes" if is_trad else "NOTES", styles["label_underline"] if is_trad else styles["label"]))
        story.append(Paragraph(str(req["notes"]), styles["muted"]))

    # --- Terms & conditions (separate from the meta-row "TERMS") ---
    if req.get("terms_text"):
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph(
            "Terms & Conditions" if is_trad else "TERMS &amp; CONDITIONS",
            styles["label_underline"] if is_trad else styles["label"],
        ))
        story.append(Paragraph(str(req["terms_text"]), styles["muted"]))

    # --- Signature (drawn canvas or uploaded image) ---
    sig = _logo_flowable(
        req.get("signature_data_url") or req.get("signatureDataUrl"),
        max_w=60 * mm, max_h=20 * mm,
    )
    if sig is not None:
        story.append(Spacer(1, 12 * mm))
        story.append(Paragraph(
            "Signature" if is_trad else "SIGNATURE",
            styles["label_underline"] if is_trad else styles["label"],
        ))
        story.append(sig)
        story.append(Table([[""]], colWidths=[60 * mm], rowHeights=[1],
                           style=TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.5, INK)])))

    # --- Footer image rendered as a banner across the full width. ---
    footer = _logo_flowable(
        req.get("footer_image_data_url") or req.get("footerImageDataUrl"),
        max_w=doc.width, max_h=30 * mm,
    )
    if footer is not None:
        story.append(Spacer(1, 8 * mm))
        if is_trad:
            # Draw a horizontal rule above the footer in traditional mode.
            story.append(Table([[""]], colWidths=[doc.width], rowHeights=[1],
                               style=TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.6, INK)])))
            story.append(Spacer(1, 3 * mm))
        story.append(footer)

    doc.build(story)
