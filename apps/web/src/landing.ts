import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './landing.css';

gsap.registerPlugin(ScrollTrigger);

const root = document.querySelector<HTMLElement>('.landing-page');
if (root) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const media = gsap.matchMedia();
  const interactions = gsap.context(() => {}, root);
  const disposers: Array<() => void> = [];
  const on = (target: EventTarget, event: string, handler: EventListener) => {
    target.addEventListener(event, handler);
    disposers.push(() => target.removeEventListener(event, handler));
  };
  const panes = Array.from(root.querySelectorAll<HTMLElement>('[data-demo]'));
  const previewButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-preview]'));
  const preview = root.querySelector<HTMLElement>('.memory-preview');
  let selectedPreview = 0;

  function showPreview(index: number, animate = true) {
    if (index === selectedPreview || !panes[index]) return;
    selectedPreview = index;
    panes.forEach((pane, i) => {
      gsap.killTweensOf(pane);
      pane.hidden = i !== index;
      // Hidden panes also leave the keyboard and accessibility tree.
    });
    previewButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    const pageNumber = root?.querySelector('.preview-page');
    if (pageNumber) pageNumber.textContent = `0${index + 1} / 03`;
    interactions.add(() => {
      gsap.set(panes[index], { clearProps: 'opacity,visibility,transform' });
      if (animate && !reduceMotion.matches) {
        gsap.from(panes[index], { opacity: 0, y: 14, duration: .45, ease: 'power3.out', clearProps: 'opacity,transform' });
      }
    });
  }

  previewButtons.forEach(button => on(button, 'click', () => showPreview(Number(button.dataset.preview))));
  const modeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mode]'));
  const modeDisplay = root.querySelector<HTMLElement>('.mode-display');
  const prompt = root.querySelector<HTMLElement>('.mode-prompt');
  const description = root.querySelector<HTMLElement>('.mode-description');
  const wave = root.querySelector<HTMLElement>('.audio-wave');
  modeButtons.forEach(button => on(button, 'click', () => {
    const mode = button.dataset.mode;
    modeButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    if (prompt) {
      prompt.hidden = mode === 'audio';
      prompt.textContent = mode === 'kana' ? 'こもれび' : '木漏れ日';
    }
    if (wave) wave.hidden = mode !== 'audio';
    if (description) description.textContent = mode === 'audio'
      ? '听音辨析示意：从发音，回忆词义。'
      : mode === 'kana' ? '从假名，回忆汉字与词义。' : '从汉字，回忆读音与词义。';
    if (!reduceMotion.matches && modeDisplay) interactions.add(() => {
      gsap.fromTo(modeDisplay, { opacity: .2, y: 8 }, { opacity: 1, y: 0, duration: .3, overwrite: true, ease: 'power2.out', clearProps: 'opacity,transform' });
      if (mode === 'audio') gsap.fromTo('.audio-wave i', { scaleY: .25 }, { scaleY: 1, duration: .5, stagger: { from: 'center', each: .025 }, ease: 'back.out(1.6)' });
    });
  }));

  const collect = root.querySelector<HTMLButtonElement>('.collect-button');
  if (collect) on(collect, 'click', () => {
    const saved = collect.getAttribute('aria-pressed') !== 'true';
    collect.setAttribute('aria-pressed', String(saved));
    const label = collect.querySelector('.collect-label');
    const star = collect.querySelector('.collect-star');
    const status = root.querySelector('.collection-status');
    if (label) label.textContent = saved ? '已加入示意生词本' : '试着加入生词本';
    if (star) star.textContent = saved ? '★' : '☆';
    if (status) status.textContent = saved ? '已收藏。难记的词，留给下一次巩固。' : '已取消示意收藏，可以再试一次。';
    if (!reduceMotion.matches) interactions.add(() => {
      gsap.fromTo(collect, { scale: .96 }, { scale: 1, duration: .45, ease: 'back.out(2)', overwrite: true, clearProps: 'transform' });
      gsap.fromTo(star, { rotation: -25, scale: .5 }, { rotation: 0, scale: 1, duration: .45, ease: 'back.out(2)', overwrite: true });
    });
  });

  const menu = root.querySelector<HTMLButtonElement>('.landing-menu');
  const nav = root.querySelector<HTMLElement>('.site-nav');
  function closeMenu(restoreFocus = false) {
    nav?.classList.remove('is-open');
    menu?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) menu?.focus();
  }
  if (menu && nav) {
    on(menu, 'click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      if (open && !reduceMotion.matches) interactions.add(() => {
        gsap.fromTo(nav, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: .22, overwrite: true, clearProps: 'opacity,transform' });
      });
    });
    on(document, 'keydown', event => {
      if ((event as KeyboardEvent).key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') closeMenu(true);
    });
    on(document, 'pointerdown', event => {
      const target = event.target as Node;
      if (!nav.contains(target) && !menu.contains(target)) closeMenu();
    });
    on(nav, 'click', event => { if ((event.target as Element).closest('a')) closeMenu(); });
    on(window, 'resize', () => { if (window.innerWidth > 800) closeMenu(); });
  }

  try {
    media.add({ desktop: '(min-width: 801px)', mobile: '(max-width: 800px)', reduce: '(prefers-reduced-motion: reduce)' }, context => {
      const { desktop, reduce } = context.conditions!;
      // Scrolling stays native. The sticky illustration follows the text chapters.
      if (desktop) root.querySelectorAll<HTMLElement>('[data-story]').forEach(story => {
        const update = () => {
          if (!preview?.contains(document.activeElement)) showPreview(Number(story.dataset.story), !reduce);
        };
        ScrollTrigger.create({ trigger: story, start: 'top 55%', end: 'bottom 55%', onEnter: update, onEnterBack: update });
      });
      gsap.to('.reading-progress > div', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: document.documentElement, start: 0, end: 'max', scrub: true } });
      if (reduce) {
        interactions.revert();
        return;
      }

      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.title-mask > span', { yPercent: 112, duration: 1, stagger: .12 }, 0)
        .from('.hero-enter', { y: 18, opacity: 0, duration: .7, stagger: .07 }, .1)
        .from('.art-entry', { y: 55, duration: 1 }, .15)
        .from('.word-sheet', { opacity: 0, duration: 1, stagger: .12 }, .15)
        .from('.art-stamp, .art-caption', { opacity: 0, y: 12, duration: .7, stagger: .1 }, .7);

      root.querySelectorAll<HTMLElement>('[data-reveal]').forEach(element => {
        gsap.from(element, { y: 30, opacity: 0, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: element, start: 'top 92%', once: true } });
      });
      if (desktop) {
        gsap.to('.sheet-back', { y: -65, rotation: -17, ease: 'none', scrollTrigger: { trigger: '.landing-hero', start: 'top top', end: 'bottom top', scrub: 1 } });
        gsap.to('.sheet-middle', { y: -32, rotation: 15, ease: 'none', scrollTrigger: { trigger: '.landing-hero', start: 'top top', end: 'bottom top', scrub: 1 } });
        gsap.to('.sheet-front', { y: 30, rotation: 1, ease: 'none', scrollTrigger: { trigger: '.landing-hero', start: 'top top', end: 'bottom top', scrub: 1 } });
      }
      gsap.from('.book-cover', {
        y: desktop ? 95 : 35, rotation: i => desktop ? (i - 2.5) * 5 : 0, opacity: .15,
        stagger: .08, ease: 'power2.out',
        scrollTrigger: { trigger: '.book-shelf', start: 'top 95%', end: 'top 44%', scrub: .7, invalidateOnRefresh: true }
      });
      const curve = root.querySelector<SVGPathElement>('.curve-path');
      if (curve) {
        const length = curve.getTotalLength();
        gsap.fromTo(curve, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', scrollTrigger: { trigger: '.memory-preview', start: 'top 80%', once: true } });
      }
      root.querySelectorAll<HTMLElement>('.memory-story').forEach(story => {
        gsap.from(story.children, { y: 25, opacity: 0, duration: .7, stagger: .08, scrollTrigger: { trigger: story, start: 'top 80%', once: true } });
      });
      gsap.from('.browser-note', { y: 45, rotation: -5, ease: 'none', scrollTrigger: { trigger: '.device-art', start: 'top 85%', end: 'bottom 60%', scrub: .7 } });
      gsap.from('.quiet-line', { x: i => i === 0 ? -35 : 35, opacity: .25, stagger: .15, ease: 'none', scrollTrigger: { trigger: '.quiet-section', start: 'top 85%', end: 'top 20%', scrub: .7 } });
      root.querySelectorAll<SVGPathElement>('.final-art path').forEach(path => {
        const length = path.getTotalLength();
        gsap.fromTo(path, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut', scrollTrigger: { trigger: '.final-art', start: 'top 85%', once: true } });
      });
      return () => { gsap.killTweensOf(panes); };
    }, root);

    media.add({ reduce: '(prefers-reduced-motion: reduce)', animate: '(prefers-reduced-motion: no-preference)' }, context => {
      const ribbon = root.querySelector<HTMLElement>('.word-ribbon');
      const track = root.querySelector<HTMLElement>('.ribbon-track');
      const group = root.querySelector<HTMLElement>('.ribbon-set');
      if (!ribbon || !track || !group) return;
      const seed = Array.from(group.children).slice(0, 6).map(element => element.cloneNode(true));
      const setX = gsap.quickSetter(track, 'x', 'px');
      let unitWidth = 0;
      let x = 0;
      let wrap = gsap.utils.wrap(-1, 0);
      let boost = 0;
      const rebuild = () => {
        const phase = unitWidth ? -x / unitWidth : 0;
        group.replaceChildren(...seed.map(element => element.cloneNode(true)));
        const seedWidth = group.getBoundingClientRect().width;
        const copies = Math.max(1, Math.ceil(ribbon.clientWidth / seedWidth) + 1);
        const fragment = document.createDocumentFragment();
        for (let i = 1; i < copies; i++) seed.forEach(element => fragment.append(element.cloneNode(true)));
        group.appendChild(fragment);
        unitWidth = group.getBoundingClientRect().width;
        wrap = gsap.utils.wrap(-unitWidth, 0);
        // Both halves are identical and wider than the screen, including ultra-wide screens.
        track.replaceChildren(group, group.cloneNode(true));
        x = -phase * unitWidth;
        setX(x);
      };
      rebuild();
      const resize = new ResizeObserver(rebuild);
      resize.observe(ribbon);
      let visible = false;
      let running = false;
      const tick = (_time: number, deltaMs: number) => {
        const seconds = Math.min(deltaMs, 64) / 1000;
        x = wrap(x - (24 + boost) * seconds);
        boost *= Math.exp(-seconds * 4);
        setX(x);
      };
      const syncPlayback = () => {
        const shouldRun = visible && !document.hidden && !context.conditions?.reduce;
        if (shouldRun && !running) gsap.ticker.add(tick);
        if (!shouldRun && running) gsap.ticker.remove(tick);
        running = Boolean(shouldRun);
      };
      const trigger = ScrollTrigger.create({
        trigger: ribbon, start: 'top bottom', end: 'bottom top',
        onToggle: self => { visible = self.isActive; syncPlayback(); },
        onUpdate: self => { boost = gsap.utils.clamp(0, 100, Math.abs(self.getVelocity()) * .05); }
      });
      visible = trigger.isActive;
      syncPlayback();
      document.addEventListener('visibilitychange', syncPlayback);
      return () => {
        resize.disconnect();
        gsap.ticker.remove(tick);
        document.removeEventListener('visibilitychange', syncPlayback);
        gsap.set(track, { clearProps: 'transform' });
      };
    }, root);

    // Pointer response is confined to decoration and omitted on touch devices.
    media.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
      const art = root.querySelector<HTMLElement>('.hero-art');
      const target = root.querySelector<HTMLElement>('.art-parallax');
      if (!art || !target) return;
      const x = gsap.quickTo(target, 'x', { duration: .7, ease: 'power3.out' });
      const y = gsap.quickTo(target, 'y', { duration: .7, ease: 'power3.out' });
      let bounds = art.getBoundingClientRect();
      const enter = () => { bounds = art.getBoundingClientRect(); };
      const move = (event: PointerEvent) => {
        x(((event.clientX - bounds.left) / bounds.width - .5) * 18);
        y(((event.clientY - bounds.top) / bounds.height - .5) * 14);
      };
      const leave = () => { x(0); y(0); };
      art.addEventListener('pointerenter', enter);
      art.addEventListener('pointermove', move);
      art.addEventListener('pointerleave', leave);
      return () => { art.removeEventListener('pointerenter', enter); art.removeEventListener('pointermove', move); art.removeEventListener('pointerleave', leave); };
    }, root);
    root.classList.add('motion-ready');
    void document.fonts.ready.then(() => ScrollTrigger.refresh());
  } catch (error) {
    media.revert();
    // Content is visible without motion, including when animation setup fails.
    console.warn('Landing motion unavailable; the static introduction remains available.', error);
  }
  on(window, 'pagehide', event => {
    if ((event as PageTransitionEvent).persisted) return;
    media.revert();
    interactions.revert();
    disposers.forEach(dispose => dispose());
  });
}
