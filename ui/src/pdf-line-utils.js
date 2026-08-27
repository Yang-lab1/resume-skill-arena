function normalizedLine(parts) {
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// PDF.js exposes visual line boundaries through `hasEOL`. Preserve them instead
// of flattening a complete page into one paragraph: the backend uses each line
// as an immutable source block for ChangeSet provenance.
export function textItemsToLines(items) {
  const lines = [];
  let current = [];
  const commit = () => {
    const line = normalizedLine(current);
    if (line) lines.push(line);
    current = [];
  };

  for (const item of items) {
    const text = "str" in item ? item.str : "";
    if (text) current.push(text);
    if ("hasEOL" in item && item.hasEOL) commit();
  }
  commit();
  return lines;
}

export function normalizePdfSourceText(value) {
  return String(value || "").replace(/^【第\s*\d+\s*页】\s*/, "").replace(/\s+/g, "");
}

export function findPdfTargetBox(items, viewport, targetText) {
  const target = normalizePdfSourceText(targetText);
  if (!target) return null;
  const scale = viewport?.scale || 1;
  let lineItems = [];
  const matches = [];

  const lineBox = () => {
    if (!lineItems.length) return null;
    const lineText = normalizePdfSourceText(lineItems.map((item) => item.str || "").join(" "));
    if (!lineText || lineText !== target) return null;
    const boxes = lineItems.map((item) => {
      const height = Math.max(16, Math.abs(item.height || 12) * scale);
      const left = item.transform[4] * scale;
      const top = viewport.height - item.transform[5] * scale - height;
      const width = Math.max(1, (item.width || normalizePdfSourceText(item.str).length * 7) * scale);
      return { left, top, right: left + width, bottom: top + height };
    });
    const left = Math.min(...boxes.map((box) => box.left)) - 4;
    const top = Math.min(...boxes.map((box) => box.top)) - 3;
    const right = Math.max(...boxes.map((box) => box.right)) + 4;
    const bottom = Math.max(...boxes.map((box) => box.bottom)) + 3;
    return { left, top, width: Math.max(40, right - left), height: Math.max(22, bottom - top) };
  };

  for (const item of items || []) {
    if (item?.str) lineItems.push(item);
    if (item?.hasEOL) {
      const match = lineBox();
      if (match) matches.push(match);
      lineItems = [];
    }
  }
  const finalMatch = lineBox();
  if (finalMatch) matches.push(finalMatch);
  return matches.length === 1 ? matches[0] : null;
}
