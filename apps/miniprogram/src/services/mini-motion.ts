import { gsap } from "gsap/gsap-core";

export interface MiniEntranceFrame {
  surface: number;
  copy: number;
  description: number;
  seal: number;
  turn: number;
}

export const REST_ENTRANCE: Readonly<MiniEntranceFrame> = {
  surface: 1, copy: 1, description: 1, seal: 1, turn: 12,
};

// Animate plain objects; native views receive transform/opacity styles only.
export function createMiniEntrance(render: (frame: MiniEntranceFrame) => void) {
  const pose = { ...REST_ENTRANCE };
  let animation: ReturnType<typeof gsap.timeline> | undefined;
  let disposed = false;
  let lastPaint = 0;
  function paint(force = false) {
    if (disposed) return;
    const now = Date.now();
    // Bound native bridge writes to about 30 fps during a short entrance.
    if (!force && now - lastPaint < 32) return;
    lastPaint = now;
    render({ surface: pose.surface, copy: pose.copy, description: pose.description, seal: pose.seal, turn: pose.turn });
  }
  function stop() {
    animation?.kill();
    animation = undefined;
    Object.assign(pose, REST_ENTRANCE);
    paint(true);
  }
  function enter(decorative = false) {
    if (disposed) return;
    stop();
    Object.assign(pose, { surface: 0, copy: decorative ? 0 : 1, description: decorative ? 0 : 1, seal: decorative ? 0 : 1, turn: decorative ? -8 : 12 });
    paint(true);
    animation = gsap.timeline({
      paused: true,
      defaults: { ease: "power3.out", overwrite: "auto" },
      onUpdate: () => paint(),
      onComplete: () => { Object.assign(pose, REST_ENTRANCE); paint(true); },
    }).to(pose, { surface: 1, duration: .46 }, 0);
    if (decorative) {
      animation.to(pose, { copy: 1, duration: .48 }, .045)
        .to(pose, { description: 1, duration: .42 }, .1)
        .to(pose, { seal: 1, turn: 12, duration: .58, ease: "back.out(1.3)" }, .06);
    }
    animation.play();
  }
  return {
    enter, stop,
    get animation() { return animation; },
    dispose() { animation?.kill(); animation = undefined; disposed = true; },
  };
}
