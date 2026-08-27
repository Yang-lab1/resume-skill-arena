import { selectProviders } from "../config/provider-selection.js";
import type { Provider } from "./types.js";

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export class ProviderRegistry {
  readonly #providers = new Map<string, Provider>();

  constructor(providers: readonly Provider[] = []) {
    providers.forEach((provider) => this.register(provider));
  }

  register(provider: Provider): void {
    const id = provider.manifest.id;
    if (!PROVIDER_ID_PATTERN.test(id)) {
      throw new Error(`Provider ID 格式无效：${id}`);
    }
    if (this.#providers.has(id)) {
      throw new Error(`Provider 重复注册：${id}`);
    }
    this.#providers.set(id, provider);
  }

  listEnabled(): Provider[] {
    return [...this.#providers.values()].filter(
      (provider) => provider.manifest.enabled
    );
  }

  select(requestedProviderIds?: readonly string[]): Provider[] {
    const enabled = this.listEnabled();
    const selectedIds = selectProviders(
      enabled.map((provider) => provider.manifest.id),
      requestedProviderIds
    );
    if (new Set(selectedIds).size !== selectedIds.length) {
      throw new Error("不能重复选择同一个 Provider。");
    }
    const byId = new Map(enabled.map((provider) => [provider.manifest.id, provider]));
    return selectedIds.map((id) => {
      const provider = byId.get(id);
      if (!provider) {
        throw new Error(`Provider 未注册或未启用：${id}`);
      }
      return provider;
    });
  }
}

