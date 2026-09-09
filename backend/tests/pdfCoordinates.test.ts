import { describe, it, expect } from "vitest";
import path from "path";
import {
  extractPdfCoordinates,
  findChunkBoundingBoxes,
} from "../src/services/pdfCoordinates";

describe("pdfCoordinates service", () => {
  const samplePdfPath = path.join(
    __dirname,
    "../uploads/2d2758c4-d2bd-4f9b-bdc4-b0a2a7135879.pdf"
  );

  it("extracts coordinate map for uploaded sample PDF", async () => {
    const coordMap = await extractPdfCoordinates(samplePdfPath);
    expect(coordMap.size).toBeGreaterThan(0);

    const page1 = coordMap.get(1);
    expect(page1).toBeDefined();
    expect(page1!.items.length).toBeGreaterThan(0);

    const firstItem = page1!.items[0];
    expect(firstItem.left).toBeGreaterThanOrEqual(0);
    expect(firstItem.left).toBeLessThanOrEqual(100);
    expect(firstItem.top).toBeGreaterThanOrEqual(0);
    expect(firstItem.top).toBeLessThanOrEqual(100);
  });

  it("computes non-empty bounding box for matching text chunk", async () => {
    const coordMap = await extractPdfCoordinates(samplePdfPath);
    const page1 = coordMap.get(1);

    const sampleChunk = "The system uses a multi-agent flow";
    const result = findChunkBoundingBoxes({
      chunkText: sampleChunk,
      pageNumber: 1,
      pageCoordMap: page1,
    });

    expect(result.bbox).toBeDefined();
    expect(result.bbox.pageIndex).toBe(0);
    expect(result.bbox.width).toBeGreaterThan(0);
    expect(result.bbox.height).toBeGreaterThan(0);
    expect(result.boxes.length).toBeGreaterThan(0);
  });
});
