import fs from "fs/promises";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import type { BoundingBox } from "../types";
import { logger } from "../utils/logger";

export interface TextItemInfo {
  str: string;
  left: number;   // percentage 0-100
  top: number;    // percentage 0-100
  width: number;  // percentage 0-100
  height: number; // percentage 0-100
  right: number;
  bottom: number;
  startChar: number;
  endChar: number;
}

export interface PageCoordinateMap {
  pageNumber: number; // 1-indexed
  pageIndex: number;  // 0-indexed
  viewport: { width: number; height: number };
  items: TextItemInfo[];
  fullText: string;
}

/**
 * Extracts per-page text items and coordinate information from a PDF file.
 */
export async function extractPdfCoordinates(
  filePath: string
): Promise<Map<number, PageCoordinateMap>> {
  const coordinateMap = new Map<number, PageCoordinateMap>();

  try {
    const dataBuffer = await fs.readFile(filePath);

    await pdfParse(dataBuffer, {
      pagerender: async function (pageData: any) {
        const textContent = await pageData.getTextContent();
        const viewport = pageData.getViewport(1.0);
        const pageNumber = pageData.pageIndex + 1;
        const pageIndex = pageData.pageIndex;

        let charOffset = 0;
        let fullText = "";
        const items: TextItemInfo[] = [];

        for (const item of textContent.items) {
          if (!item.str) continue;

          const str = item.str;
          const tx = item.transform ? item.transform[4] : 0;
          const ty = item.transform ? item.transform[5] : 0;
          const itemWidth = item.width || 0;
          const itemHeight = item.height || 0;

          // Convert PDF points (bottom-left origin) to percentage viewport coordinates (top-left origin)
          const left = viewport.width > 0 ? (tx / viewport.width) * 100 : 0;
          const top =
            viewport.height > 0
              ? ((viewport.height - ty - itemHeight) / viewport.height) * 100
              : 0;
          const width =
            viewport.width > 0 ? (itemWidth / viewport.width) * 100 : 0;
          const height =
            viewport.height > 0 ? (itemHeight / viewport.height) * 100 : 0;

          const startChar = charOffset;
          const endChar = charOffset + str.length;
          charOffset = endChar + 1; // plus 1 for space delimiter
          fullText += str + " ";

          items.push({
            str,
            left: Math.max(0, Math.min(100, left)),
            top: Math.max(0, Math.min(100, top)),
            width: Math.max(0, Math.min(100, width)),
            height: Math.max(0, Math.min(100, height)),
            right: Math.max(0, Math.min(100, left + width)),
            bottom: Math.max(0, Math.min(100, top + height)),
            startChar,
            endChar,
          });
        }

        coordinateMap.set(pageNumber, {
          pageNumber,
          pageIndex,
          viewport: { width: viewport.width, height: viewport.height },
          items,
          fullText,
        });

        return "";
      },
    });
  } catch (err) {
    logger.warn(
      { err, filePath },
      "Could not extract detailed PDF coordinates; fallback coordinates will be used."
    );
  }

  return coordinateMap;
}

/**
 * Calculates bounding box (and line boxes) for a chunk of text within a specific page.
 */
export function findChunkBoundingBoxes(params: {
  chunkText: string;
  pageNumber: number;
  pageCoordMap?: PageCoordinateMap;
}): { bbox: BoundingBox; boxes: BoundingBox[] } {
  const { chunkText, pageNumber, pageCoordMap } = params;
  const pageIndex = Math.max(0, pageNumber - 1);

  // Fallback defaults if page coordinate data is unavailable
  const fallbackBbox: BoundingBox = {
    pageIndex,
    left: 10,
    top: 15,
    width: 80,
    height: 12,
  };

  if (!pageCoordMap || pageCoordMap.items.length === 0) {
    return { bbox: fallbackBbox, boxes: [fallbackBbox] };
  }

  const { items, fullText } = pageCoordMap;
  const cleanChunk = chunkText.trim();
  if (!cleanChunk) {
    return { bbox: fallbackBbox, boxes: [fallbackBbox] };
  }

  // 1. Attempt exact or fuzzy substring match in page fullText
  let startCharIdx = fullText.indexOf(cleanChunk);
  let endCharIdx = -1;

  if (startCharIdx !== -1) {
    endCharIdx = startCharIdx + cleanChunk.length;
  } else {
    // Substring fallback: search for first 30 chars and last 30 chars
    const headSample = cleanChunk.slice(0, Math.min(30, cleanChunk.length)).trim();
    const tailSample = cleanChunk
      .slice(Math.max(0, cleanChunk.length - 30))
      .trim();

    const headIdx = fullText.indexOf(headSample);
    const tailIdx = fullText.lastIndexOf(tailSample);

    if (headIdx !== -1) {
      startCharIdx = headIdx;
      endCharIdx =
        tailIdx !== -1 && tailIdx >= headIdx
          ? tailIdx + tailSample.length
          : headIdx + cleanChunk.length;
    }
  }

  let matchedItems: TextItemInfo[] = [];

  if (startCharIdx !== -1 && endCharIdx !== -1) {
    matchedItems = items.filter(
      (item) =>
        item.endChar >= startCharIdx &&
        item.startChar <= endCharIdx &&
        item.str.trim().length > 0
    );
  }

  // Word token matching fallback if character offsets didn't find items
  if (matchedItems.length === 0) {
    const words = cleanChunk
      .split(/\s+/)
      .map((w) => w.replace(/[^\w]/g, "").toLowerCase())
      .filter((w) => w.length >= 4);

    if (words.length > 0) {
      const candidates = items.filter((item) => {
        const itemClean = item.str.replace(/[^\w]/g, "").toLowerCase();
        return words.includes(itemClean);
      });

      if (candidates.length > 0) {
        matchedItems = candidates;
      }
    }
  }

  if (matchedItems.length === 0) {
    return { bbox: fallbackBbox, boxes: [fallbackBbox] };
  }

  // Compute enclosing paragraph bounding box
  const minLeft = Math.min(...matchedItems.map((i) => i.left));
  const minTop = Math.min(...matchedItems.map((i) => i.top));
  const maxRight = Math.max(...matchedItems.map((i) => i.right));
  const maxBottom = Math.max(...matchedItems.map((i) => i.bottom));

  const bbox: BoundingBox = {
    pageIndex,
    left: Number(Math.max(0, minLeft).toFixed(2)),
    top: Number(Math.max(0, minTop).toFixed(2)),
    width: Number(Math.max(1, Math.min(100 - minLeft, maxRight - minLeft)).toFixed(2)),
    height: Number(Math.max(1, Math.min(100 - minTop, maxBottom - minTop)).toFixed(2)),
  };

  // Group matched items into distinct horizontal lines (within 1% vertical difference)
  const sortedItems = [...matchedItems].sort((a, b) => a.top - b.top || a.left - b.left);
  const lineGroups: TextItemInfo[][] = [];

  for (const item of sortedItems) {
    const currentLine = lineGroups.find(
      (group) => Math.abs(group[0].top - item.top) <= 1.2
    );
    if (currentLine) {
      currentLine.push(item);
    } else {
      lineGroups.push([item]);
    }
  }

  const boxes: BoundingBox[] = lineGroups.map((group) => {
    const l = Math.min(...group.map((i) => i.left));
    const t = Math.min(...group.map((i) => i.top));
    const r = Math.max(...group.map((i) => i.right));
    const b = Math.max(...group.map((i) => i.bottom));
    return {
      pageIndex,
      left: Number(Math.max(0, l).toFixed(2)),
      top: Number(Math.max(0, t).toFixed(2)),
      width: Number(Math.max(1, Math.min(100 - l, r - l)).toFixed(2)),
      height: Number(Math.max(1, Math.min(100 - t, b - t)).toFixed(2)),
    };
  });

  return {
    bbox,
    boxes: boxes.length > 0 ? boxes : [bbox],
  };
}
