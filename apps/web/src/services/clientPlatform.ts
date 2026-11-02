export function isIosOrAndroid(userAgent: string, platform = '', maxTouchPoints = 0): boolean {
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
    || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function showWindowsDownload(protocol: string, userAgent: string, platform = '', maxTouchPoints = 0): boolean {
  return protocol !== 'kotoba:' && !isIosOrAndroid(userAgent, platform, maxTouchPoints);
}
