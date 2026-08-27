export function clipboardImageFiles(clipboardData) {
  if (!clipboardData) return [];
  return Array.from(clipboardData.items || [])
    .filter((item) => item?.kind === "file" && /^image\/(?:png|jpeg)$/i.test(item.type || ""))
    .map((item) => item.getAsFile?.())
    .filter(Boolean);
}
