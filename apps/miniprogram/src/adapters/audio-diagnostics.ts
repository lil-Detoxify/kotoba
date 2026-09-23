/** Safe, opt-in timing capture for local audio startup investigations. */
export const AUDIO_DIAGNOSTIC_EVENT_TYPES = [
  "contextCreateStart", "contextCreateReady", "srcAssigned", "playCalled",
  "canplay", "playEvent", "ended", "error",
] as const;

export type AudioDiagnosticEventType = typeof AUDIO_DIAGNOSTIC_EVENT_TYPES[number];

export interface AudioDiagnosticEvent {
  playId: number;
  type: AudioDiagnosticEventType;
  at: number;
}

export interface AudioDiagnosticSummary {
  playId: number;
  eventCount: number;
  totalMs?: number;
  contextCreateMs?: number;
  playToCanplayMs?: number;
  playToPlayEventMs?: number;
  playToEndedMs?: number;
  failed: boolean;
}

export interface AudioDiagnosticsOptions {
  enabled?: boolean;
  now?: () => number;
}

/** In-memory opt-in capture. It never stores URLs or native error details. */
export class AudioDiagnosticSession {
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly captured: AudioDiagnosticEvent[] = [];

  constructor(options: AudioDiagnosticsOptions = {}) {
    this.enabled = options.enabled === true;
    this.now = options.now ?? (() => Date.now());
  }

  readonly record = (event: Omit<AudioDiagnosticEvent, "at">): void => {
    if (!this.enabled || !isAudioDiagnosticEventType(event.type)) return;
    this.captured.push({ playId: event.playId, type: event.type, at: this.now() });
  };

  events(): AudioDiagnosticEvent[] {
    return this.captured.map((event) => ({ ...event }));
  }

  summaries(): AudioDiagnosticSummary[] {
    const plays = new Map<number, AudioDiagnosticEvent[]>();
    for (const event of this.captured) {
      const group = plays.get(event.playId) ?? [];
      group.push(event);
      plays.set(event.playId, group);
    }
    return [...plays.entries()].map(([playId, events]) => {
      const at = (type: AudioDiagnosticEventType) => events.find((event) => event.type === type)?.at;
      const start = at("playCalled") ?? at("contextCreateStart");
      const end = at("ended") ?? at("error");
      return {
        playId,
        eventCount: events.length,
        totalMs: elapsed(start, end),
        contextCreateMs: elapsed(at("contextCreateStart"), at("contextCreateReady")),
        playToCanplayMs: elapsed(at("playCalled"), at("canplay")),
        playToPlayEventMs: elapsed(at("playCalled"), at("playEvent")),
        playToEndedMs: elapsed(at("playCalled"), at("ended")),
        failed: events.some((event) => event.type === "error"),
      };
    });
  }

  clear(): void {
    this.captured.length = 0;
  }
}

function elapsed(start: number | undefined, end: number | undefined): number | undefined {
  return start === undefined || end === undefined ? undefined : Math.max(0, end - start);
}

function isAudioDiagnosticEventType(value: string): value is AudioDiagnosticEventType {
  return (AUDIO_DIAGNOSTIC_EVENT_TYPES as readonly string[]).includes(value);
}
