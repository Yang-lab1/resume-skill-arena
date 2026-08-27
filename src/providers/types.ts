import type { ChangeSetBaselineReference } from "../baseline/freeze.js";
import type { FrozenBaseline } from "../baseline/types.js";

export interface ProviderManifest {
  id: string;
  name: string;
  version: string;
  adapterId: string;
  adapterVersion: string;
  enabled: boolean;
  referenceOnly?: boolean;
}

export interface ProviderContext {
  orchestrationId: string;
  invocationId: string;
  baseline: Readonly<FrozenBaseline>;
  baselineReference: Readonly<ChangeSetBaselineReference>;
  signal: AbortSignal;
}

export interface Provider {
  manifest: ProviderManifest;
  execute(context: ProviderContext): Promise<unknown>;
}

