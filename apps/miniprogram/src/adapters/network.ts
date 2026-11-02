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

/** Version manifests bypass a prior session's HTTP cache; book files use their content version. */
export class UniContentNetworkAdapter extends UniNetworkAdapter {
  private readonly session = Date.now().toString(36);
  private readonly versions = new Map<string, string>();

  override async request<T>(endpoint: string, options: HttpRequestOptions = {}): Promise<T> {
    const path = endpoint.split('?')[0];
    const manifest = path.endsWith('/manifest.json');
    const version = manifest ? this.session : this.versions.get(path);
    const url = version ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}${manifest ? 'refresh' : 'v'}=${version}` : endpoint;
    const result = await super.request<T>(url, options);
    if (manifest && result && typeof result === 'object') {
      const books = (result as {books?:unknown}).books;
      if (Array.isArray(books)) for (const book of books) {
        if (book && typeof book.id === 'string' && /^[a-z0-9-]+$/u.test(book.id) && typeof book.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(book.sha256)) {
          this.versions.set(path.slice(0, -'manifest.json'.length) + book.id + '.json', book.sha256);
        }
      }
    }
    return result;
  }
}
