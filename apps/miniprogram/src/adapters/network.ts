import type { NetworkAdapter, HttpRequestOptions } from "./types";

export class UniNetworkAdapter implements NetworkAdapter {
  constructor(private baseUrl = "") {}

  async request<T>(endpoint: string, options: HttpRequestOptions = {}): Promise<T> {
    const fullUrl = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;

    return new Promise<T>((resolve, reject) => {
      // @ts-ignore
      if (typeof uni === "undefined" || !uni.request) {
        return reject(new Error("uni.request is not available"));
      }

      // @ts-ignore
      uni.request({
        url: fullUrl,
        method: options.method || "GET",
        data: options.data,
        header: {
          "content-type": "application/json",
          ...(options.headers || {})
        },
        timeout: options.timeout || 10000,
        success: (res: any) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data as T);
          } else {
            const msg = res.data?.message || res.data?.error || `HTTP ${res.statusCode}`;
            reject(new Error(msg));
          }
        },
        fail: (err: any) => {
          reject(new Error(err.errMsg || "Network request failed"));
        }
      });
    });
  }
}
