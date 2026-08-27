export function tesseractLines(data) {
  if (Array.isArray(data?.lines)) return data.lines;
  if (!Array.isArray(data?.blocks)) return [];
  return data.blocks.flatMap((block) =>
    Array.isArray(block?.paragraphs)
      ? block.paragraphs.flatMap((paragraph) => Array.isArray(paragraph?.lines) ? paragraph.lines : [])
      : []
  );
}

export function findOcrLine(lines, targetText, normalize) {
  const target = normalize(targetText);
  if (!target) return null;
  const matches = (lines || []).filter((line) => {
    const text = normalize(line?.text);
    return text && text === target;
  });
  return matches.length === 1 ? matches[0] : null;
}
