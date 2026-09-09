"""Multi-Modal Document Parser.

Parses complex PDF artifacts into structured multi-modal chunks:
- Tables: Extracted into structured Markdown tables with exact bounding coordinates.
- Hierarchies: Headings (#, ##, ###), lists, and section breadcrumbs preserved for retrieval.
- Diagrams / Figures: Vector drawings and raster images paired with captions and bounding boxes.
- Coordinates: Normalized percentage coordinates (0-100) compatible with PDF viewers.

Uses PyMuPDF / PyMuPDF4LLM for C++ native speed and Docling item label standards.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from dataclasses import asdict, dataclass
from typing import Any

import pymupdf
import pymupdf4llm

try:
    from docling_core.types.doc import DocItemLabel
except ImportError:  # Fallback if docling_core not available in environment
    class DocItemLabel:
        TEXT = "text"
        SECTION_HEADER = "section_header"
        TABLE = "table"
        PICTURE = "picture"

logger = logging.getLogger("multimodal_parser")


@dataclass
class BoundingBox:
    pageIndex: int
    left: float
    top: float
    width: float
    height: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MultiModalChunk:
    text: str
    page: int
    bbox: dict[str, Any]
    boxes: list[dict[str, Any]]
    contentType: str  # "text" | "table" | "diagram" | "heading"
    section: str | None = None
    caption: str | None = None
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _rect_to_pct_bbox(rect: pymupdf.Rect | tuple[float, float, float, float], page_width: float, page_height: float, page_index: int) -> BoundingBox:
    """Convert PyMuPDF rect (x0, y0, x1, y1) in points to normalized percentage coordinates."""
    if isinstance(rect, (list, tuple)):
        x0, y0, x1, y1 = rect[0], rect[1], rect[2], rect[3]
    else:
        x0, y0, x1, y1 = rect.x0, rect.y0, rect.x1, rect.y1

    # Clamp coordinates to page boundaries
    x0 = max(0.0, min(page_width, x0))
    x1 = max(x0, min(page_width, x1))
    y0 = max(0.0, min(page_height, y0))
    y1 = max(y0, min(page_height, y1))

    left = round((x0 / page_width) * 100.0, 2)
    top = round((y0 / page_height) * 100.0, 2)
    width = round(((x1 - x0) / page_width) * 100.0, 2)
    height = round(((y1 - y0) / page_height) * 100.0, 2)

    return BoundingBox(
        pageIndex=page_index,
        left=left,
        top=top,
        width=max(0.1, width),
        height=max(0.1, height),
    )


def _rects_union(rects: list[pymupdf.Rect]) -> pymupdf.Rect | None:
    """Compute the bounding union of a list of PyMuPDF Rects."""
    if not rects:
        return None
    union = pymupdf.Rect(rects[0])
    for r in rects[1:]:
        union.include_rect(r)
    return union


def parse_multimodal_pdf(file_path: str, max_chunk_chars: int = 900) -> list[dict[str, Any]]:
    """Parse PDF extracting structured tables, markdown hierarchies, and diagrams."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF file not found: {file_path}")

    doc = pymupdf.open(file_path)
    total_pages = len(doc)
    all_chunks: list[MultiModalChunk] = []

    # Run PyMuPDF4LLM page-by-page markdown extraction with layout boxes
    try:
        pages_data = pymupdf4llm.to_markdown(file_path, page_chunks=True)
    except Exception as e:
        logger.warning("pymupdf4llm failed (%s), falling back to native pymupdf parser", e)
        pages_data = []

    current_breadcrumbs: list[str] = []

    for page_idx in range(total_pages):
        page = doc[page_idx]
        page_num = page_idx + 1
        page_w = page.rect.width or 595.0
        page_h = page.rect.height or 842.0

        # Track bounding boxes consumed by tables and figures to avoid duplicate chunks
        consumed_regions: list[pymupdf.Rect] = []

        # -----------------------------------------------------------------
        # 1. TABLE EXTRACTION (Structured Markdown Tables)
        # -----------------------------------------------------------------
        try:
            tabs = page.find_tables()
            for tab_idx, tab in enumerate(tabs.tables):
                table_rect = pymupdf.Rect(tab.bbox)
                # Check for minimum table size to ignore single-cell border noise
                if table_rect.width < 40 or table_rect.height < 25:
                    continue

                md_table = tab.to_markdown()
                if not md_table or not md_table.strip():
                    continue

                consumed_regions.append(table_rect)
                table_bbox = _rect_to_pct_bbox(table_rect, page_w, page_h, page_idx)

                # Look for adjacent caption or table title
                section_prefix = " > ".join(current_breadcrumbs) if current_breadcrumbs else None
                tab_text = md_table.strip()
                if section_prefix:
                    tab_text = f"**Section**: {section_prefix}\n\n{tab_text}"

                all_chunks.append(
                    MultiModalChunk(
                        text=tab_text,
                        page=page_num,
                        bbox=table_bbox.to_dict(),
                        boxes=[table_bbox.to_dict()],
                        contentType="table",
                        section=section_prefix,
                        caption=f"Table {tab_idx + 1}",
                        metadata={
                            "docling_label": DocItemLabel.TABLE,
                            "rowCount": tab.row_count,
                            "colCount": tab.col_count,
                        },
                    )
                )
        except Exception as err:
            logger.debug("Table detection skipped on page %d: %s", page_num, err)

        # -----------------------------------------------------------------
        # 2. DIAGRAM / FIGURE EXTRACTION (Vector drawings & Raster images)
        # -----------------------------------------------------------------
        try:
            # 2a. Raster images
            img_list = page.get_images(full=True)
            for img_info in img_list:
                xref = img_info[0]
                img_rects = page.get_image_rects(xref)
                for irect in img_rects:
                    if irect.width < 50 or irect.height < 50:
                        continue
                    # Ignore images covered by tables
                    if any(irect.intersects(cr) for cr in consumed_regions):
                        continue

                    consumed_regions.append(irect)
                    fig_bbox = _rect_to_pct_bbox(irect, page_w, page_h, page_idx)
                    caption = f"Figure on page {page_num}"
                    section_prefix = " > ".join(current_breadcrumbs) if current_breadcrumbs else None

                    fig_text = f"**[Figure/Diagram]** ({caption})\nPage {page_num}"
                    if section_prefix:
                        fig_text = f"**Section**: {section_prefix}\n\n{fig_text}"

                    all_chunks.append(
                        MultiModalChunk(
                            text=fig_text,
                            page=page_num,
                            bbox=fig_bbox.to_dict(),
                            boxes=[fig_bbox.to_dict()],
                            contentType="diagram",
                            section=section_prefix,
                            caption=caption,
                            metadata={"docling_label": DocItemLabel.PICTURE, "type": "raster_image"},
                        )
                    )

            # 2b. Vector drawings / diagram shapes
            drawings = page.get_drawings()
            if drawings and len(drawings) >= 4:  # Group vector drawings forming a diagram
                drawing_rects = [
                    pymupdf.Rect(d["rect"])
                    for d in drawings
                    if d.get("rect") and (d["rect"].width > 5 or d["rect"].height > 5)
                ]
                # Filter out drawing rects that fall inside already consumed tables/images
                valid_rects = [
                    r for r in drawing_rects if not any(r.intersects(cr) for cr in consumed_regions)
                ]
                d_union = _rects_union(valid_rects)
                if d_union and d_union.width > 80 and d_union.height > 60:
                    # Diagram found
                    consumed_regions.append(d_union)
                    diag_bbox = _rect_to_pct_bbox(d_union, page_w, page_h, page_idx)
                    caption = f"Vector Diagram / Flowchart on page {page_num}"
                    section_prefix = " > ".join(current_breadcrumbs) if current_breadcrumbs else None

                    diag_text = f"**[Diagram/Chart]** ({caption})\nVisual illustration and layout structure."
                    if section_prefix:
                        diag_text = f"**Section**: {section_prefix}\n\n{diag_text}"

                    all_chunks.append(
                        MultiModalChunk(
                            text=diag_text,
                            page=page_num,
                            bbox=diag_bbox.to_dict(),
                            boxes=[diag_bbox.to_dict()],
                            contentType="diagram",
                            section=section_prefix,
                            caption=caption,
                            metadata={"docling_label": DocItemLabel.PICTURE, "type": "vector_drawing"},
                        )
                    )
        except Exception as err:
            logger.debug("Diagram detection skipped on page %d: %s", page_num, err)

        # -----------------------------------------------------------------
        # 3. MARKDOWN HIERARCHY & TEXT EXTRACTION
        # -----------------------------------------------------------------
        p_data = pages_data[page_idx] if page_idx < len(pages_data) else None
        page_boxes = p_data.get("page_boxes", []) if p_data else []

        if not page_boxes:
            # Fallback to page.get_text("blocks") if pymupdf4llm returned no boxes
            blocks = page.get_text("blocks")
            for b in blocks:
                bx0, by0, bx1, by1, btext, _, btype = b
                if btype != 0 or not btext.strip():
                    continue
                brect = pymupdf.Rect(bx0, by0, bx1, by1)
                if any(brect.intersects(cr) and brect.intersect(cr).get_area() > 0.8 * brect.get_area() for cr in consumed_regions):
                    continue
                bbox = _rect_to_pct_bbox(brect, page_w, page_h, page_idx)
                all_chunks.append(
                    MultiModalChunk(
                        text=btext.strip(),
                        page=page_num,
                        bbox=bbox.to_dict(),
                        boxes=[bbox.to_dict()],
                        contentType="text",
                        section=" > ".join(current_breadcrumbs) if current_breadcrumbs else None,
                        metadata={"docling_label": DocItemLabel.TEXT},
                    )
                )
            continue

        # Process structured page_boxes from pymupdf4llm
        raw_text = p_data.get("text", "")
        current_chunk_blocks: list[dict[str, Any]] = []
        current_chunk_len = 0

        def flush_current_chunk():
            nonlocal current_chunk_blocks, current_chunk_len
            if not current_chunk_blocks:
                return

            texts = []
            box_pcts: list[dict[str, Any]] = []
            rects_to_union: list[pymupdf.Rect] = []

            is_heading_chunk = False

            for blk in current_chunk_blocks:
                pos = blk.get("pos")
                if pos and len(pos) == 2:
                    blk_text = raw_text[pos[0]:pos[1]].strip()
                else:
                    blk_text = ""

                if blk.get("class") == "section-header":
                    is_heading_chunk = True

                if blk_text:
                    texts.append(blk_text)

                bbox_coords = blk.get("bbox")
                if bbox_coords:
                    r = pymupdf.Rect(bbox_coords)
                    rects_to_union.append(r)
                    box_pcts.append(_rect_to_pct_bbox(r, page_w, page_h, page_idx).to_dict())

            joined_text = "\n\n".join(texts).strip()
            if not joined_text:
                current_chunk_blocks = []
                current_chunk_len = 0
                return

            union_rect = _rects_union(rects_to_union)
            if union_rect:
                main_bbox = _rect_to_pct_bbox(union_rect, page_w, page_h, page_idx).to_dict()
            else:
                main_bbox = box_pcts[0] if box_pcts else BoundingBox(page_idx, 10.0, 10.0, 80.0, 10.0).to_dict()

            section_context = " > ".join(current_breadcrumbs) if current_breadcrumbs else None
            # Prepend breadcrumb only if section is not already the leading text
            final_text = joined_text
            if section_context:
                top_section = current_breadcrumbs[-1]
                if not (joined_text.startswith(f"# {top_section}") or
                        joined_text.startswith(f"## {top_section}") or
                        joined_text.startswith(f"### {top_section}") or
                        joined_text.startswith(top_section)):
                    final_text = f"### Section: {section_context}\n\n{joined_text}"

            content_type = "heading" if (is_heading_chunk and len(joined_text) < 150) else "text"
            docling_label = DocItemLabel.SECTION_HEADER if content_type == "heading" else DocItemLabel.TEXT

            all_chunks.append(
                MultiModalChunk(
                    text=final_text,
                    page=page_num,
                    bbox=main_bbox,
                    boxes=box_pcts if box_pcts else [main_bbox],
                    contentType=content_type,
                    section=section_context,
                    metadata={"docling_label": docling_label},
                )
            )

            current_chunk_blocks = []
            current_chunk_len = 0

        for box in page_boxes:
            b_class = box.get("class", "text")
            bbox_coords = box.get("bbox")
            if not bbox_coords:
                continue

            brect = pymupdf.Rect(bbox_coords)
            # Check if block is inside a consumed table or diagram
            if any(brect.intersects(cr) and brect.intersect(cr).get_area() > 0.8 * brect.get_area() for cr in consumed_regions):
                continue

            pos = box.get("pos", (0, 0))
            box_text = raw_text[pos[0]:pos[1]].strip() if pos and len(pos) == 2 else ""

            # Detect and track headings
            if b_class == "section-header" or box_text.startswith(("# ", "## ", "### ", "#### ")):
                # Flush previous content so heading begins fresh chunk or leads next section
                flush_current_chunk()

                clean_heading = re.sub(r"^#+\s*", "", box_text).strip()
                if clean_heading:
                    # Update hierarchy
                    if box_text.startswith("# ") or len(current_breadcrumbs) == 0:
                        current_breadcrumbs = [clean_heading]
                    elif box_text.startswith("## "):
                        current_breadcrumbs = [current_breadcrumbs[0], clean_heading]
                    else:
                        current_breadcrumbs.append(clean_heading)
                        if len(current_breadcrumbs) > 3:
                            current_breadcrumbs = current_breadcrumbs[-3:]

            box_len = len(box_text)
            if current_chunk_len + box_len > max_chunk_chars and current_chunk_blocks:
                flush_current_chunk()

            current_chunk_blocks.append(box)
            current_chunk_len += box_len

        # Flush any remaining text on the page
        flush_current_chunk()

    doc.close()
    return [c.to_dict() for c in all_chunks]


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python -m app.rag.multimodal_parser <pdf_file_path>\n")
        print(json.dumps({"error": "Usage: python -m app.rag.multimodal_parser <pdf_file_path>"}))
        sys.exit(1)

    file_path = sys.argv[1]
    try:
        chunks = parse_multimodal_pdf(file_path)
        output_payload = json.dumps({"success": True, "count": len(chunks), "chunks": chunks})
        sys.stdout.write(f"\n__JSON_START__\n{output_payload}\n__JSON_END__\n")
        sys.stdout.flush()
    except Exception as e:
        logger.exception("Error parsing PDF: %s", e)
        error_payload = json.dumps({"success": False, "error": str(e)})
        sys.stdout.write(f"\n__JSON_START__\n{error_payload}\n__JSON_END__\n")
        sys.stdout.flush()
        sys.exit(1)



if __name__ == "__main__":
    main()
