export const DEFAULT_PROVIDER_COUNT = 3;
export const MAX_PROVIDER_COUNT = 5;

export class ProviderSelectionError extends Error {
  readonly code = "PROVIDER_LIMIT_EXCEEDED";

  constructor(readonly selectedCount: number) {
    super(`一次最多选择 ${MAX_PROVIDER_COUNT} 个专家，当前选择了 ${selectedCount} 个。`);
    this.name = "ProviderSelectionError";
  }
}

export function selectProviders(
  availableProviderIds: readonly string[],
  requestedProviderIds?: readonly string[]
): string[] {
  const selected = requestedProviderIds
    ? [...requestedProviderIds]
    : availableProviderIds.slice(0, DEFAULT_PROVIDER_COUNT);

  if (selected.length > MAX_PROVIDER_COUNT) {
    throw new ProviderSelectionError(selected.length);
  }

  return selected;
}
