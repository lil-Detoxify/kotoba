import { UniNetworkAdapter } from "./network";
import type { NetworkAdapter } from "./types";

export class MiniProgramApiClient {
  private network: NetworkAdapter;

  constructor(baseUrl = "https://kotobud.com", network?: NetworkAdapter) {
    this.network = network || new UniNetworkAdapter(baseUrl);
  }

  async getCapabilities(): Promise<{ status: string; capabilities: string[]; storage: string }> {
    return this.network.request<{ status: string; capabilities: string[]; storage: string }>("/api/v1/capabilities");
  }

  async getSyncStatus(): Promise<{ status: string; d1_bound: boolean; timestamp: string }> {
    return this.network.request<{ status: string; d1_bound: boolean; timestamp: string }>("/api/v1/sync/status");
  }
}
