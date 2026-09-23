import { describe, expect, it, vi } from "vitest";
import { AudioDiagnosticSession } from "../apps/miniprogram/src/adapters/audio-diagnostics";
import { UniAudioPlayer } from "../apps/miniprogram/src/adapters/audio";

describe("audio diagnostics", () => {
  it("captures timing events and creates per-play summaries without URL or errors", () => {
    let now = 100;
    const session = new AudioDiagnosticSession({ enabled: true, now: () => now });
    const player = new UniAudioPlayer(session.record);
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal("uni", {
      createInnerAudioContext: () => ({
        onEnded: (callback: () => void) => { listeners.ended = callback; },
        onError: () => undefined,
        onCanplay: (callback: () => void) => { listeners.canplay = callback; },
        onPlay: (callback: () => void) => { listeners.play = callback; },
        offEnded: () => undefined,
        offError: () => undefined,
        offCanplay: () => undefined,
        offPlay: () => undefined,
        play: () => undefined,
        stop: () => undefined,
        set src(_value: string) {},
      }),
    });

    const result = player.play("https://private.example/audio.mp3");
    now = 105;
    listeners.canplay();
    now = 109;
    listeners.play();
    now = 120;
    listeners.ended();

    return expect(result).resolves.toBe(true).then(() => {
      expect(session.events().map(({ type }) => type)).toEqual([
        "contextCreateStart", "contextCreateReady", "srcAssigned", "playCalled", "canplay", "playEvent", "ended",
      ]);
      expect(session.summaries()).toEqual([{
        playId: 2,
        eventCount: 7,
        totalMs: 20,
        contextCreateMs: 0,
        playToCanplayMs: 5,
        playToPlayEventMs: 9,
        playToEndedMs: 20,
        failed: false,
      }]);
      expect(JSON.stringify(session.events())).not.toContain("private.example");
      player.destroy();
      vi.unstubAllGlobals();
    });
  });

  it("is silent by default and tolerates diagnostics throwing", async () => {
    const disabled = new AudioDiagnosticSession();
    disabled.record({ playId: 1, type: "playCalled" });
    expect(disabled.events()).toEqual([]);

    const context = {
      onEnded: (_callback: () => void) => undefined,
      onError: (_callback: (error: unknown) => void) => undefined,
      play: () => undefined,
      stop: () => undefined,
    };
    vi.stubGlobal("uni", { createInnerAudioContext: () => context });
    const player = new UniAudioPlayer(() => { throw new Error("diagnostic sink failure"); });
    const pending = player.play("audio.mp3");
    player.stop();
    await expect(pending).resolves.toBe(false);
    player.destroy();
    vi.unstubAllGlobals();
  });
});
