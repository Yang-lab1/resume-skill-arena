import { createHash } from "node:crypto";

export function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForJson);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortForJson(entry)])
    );
  }

  return value;
}

export function stableStringify(value: unknown): string {
  const serialized = JSON.stringify(sortForJson(value));
  if (serialized === undefined) {
    throw new TypeError("无法序列化未定义的基线内容。");
  }
  return serialized;
}

export function stableObjectHash(value: unknown): string {
  return sha256(stableStringify(value));
}

export function stableId(namespace: string, ...parts: string[]): string {
  const safeNamespace = namespace.replace(/[^A-Za-z0-9._:-]/g, "-");
  return `${safeNamespace}.${sha256(parts.join("\u0000")).slice(0, 24)}`;
}
