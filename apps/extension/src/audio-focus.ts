let activeStop: (() => void) | undefined;

export function claimExtensionAudioFocus(stop: () => void): void {
  if (activeStop && activeStop !== stop) activeStop();
  activeStop = stop;
}

export function releaseExtensionAudioFocus(stop: () => void): void {
  if (activeStop === stop) activeStop = undefined;
}
