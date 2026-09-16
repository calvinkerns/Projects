// Replay viewer: canvas board, HUD, timeline and controls for one Surge replay.

import { WALL, buildReplay } from './engine.js';

const RGB = [[255, 138, 61], [60, 200, 255]];
const MASS_STEPS = [0, 3, 8, 20, 50, 120];
const TICKS_PER_SECOND = 20;
const STEP_XY = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const ARROW_FADE = [0.95, 0.5, 0.22];

function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function massStep(m) {
  let s = 0;
  while (s < MASS_STEPS.length - 1 && m >= MASS_STEPS[s + 1]) s++;
  return s;
}

const shortMass = (m) => (m >= 10000 ? `${Math.round(m / 1000)}k` : m >= 1000 ? `${(m / 1000).toFixed(1)}k` : String(m));

export function createViewer(container, { autoplay = false } = {}) {
  const root = el('div', 'sv', container);
  root.tabIndex = 0;

  const hud = el('div', 'sv-hud', root);
  const makeSide = (p) => {
    const box = el('div', `sv-player sv-p${p}`, hud);
    return { name: el('div', 'sv-name', box, '—'), stats: el('div', 'sv-stats', box) };
  };
  const sides = [makeSide(0)];
  const tickLabel = el('div', 'sv-tick', hud, 'tick 0');
  sides.push(makeSide(1));

  const bars = el('div', 'sv-bars', root);
  const territory = [el('div', 'sv-bar sv-bar-p0', bars), el('div', 'sv-bar sv-bar-n', bars), el('div', 'sv-bar sv-bar-p1', bars)];

  const stage = el('div', 'sv-stage', root);
  const canvas = el('canvas', 'sv-board', stage);
  const banner = el('div', 'sv-banner', stage);
  banner.hidden = true;
  const ctx = canvas.getContext('2d');

  const scrub = el('input', 'sv-scrub', root);
  scrub.type = 'range';
  scrub.min = '0';
  scrub.max = '0';
  scrub.setAttribute('aria-label', 'Timeline');

  const controls = el('div', 'sv-controls', root);
  const button = (label, aria, onClick) => {
    const b = el('button', 'sv-btn', controls, label);
    b.type = 'button';
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', onClick);
    return b;
  };
  button('◀', 'Step back', () => { pause(); seek(frame - 1); });
  const playButton = button('▶', 'Play', () => toggle());
  button('▶|', 'Step forward', () => { pause(); seek(frame + 1); });
  const speedSelect = el('select', 'sv-select', controls);
  speedSelect.setAttribute('aria-label', 'Playback speed');
  for (const s of [0.5, 1, 2, 4, 8, 16]) el('option', null, speedSelect, `${s}×`).value = String(s);
  speedSelect.value = '1';
  speedSelect.addEventListener('change', () => setSpeed(Number(speedSelect.value)));

  let built = null;
  let frame = 0;
  let playing = false;
  let speed = 1;
  let raf = 0;
  let lastTime = 0;
  let pendingTicks = 0;
  const listeners = { tick: [], end: [], load: [] };
  const emit = (event, value) => listeners[event].forEach((fn) => fn(value));

  function render() {
    if (!built) return;
    const f = built.frameAt(frame);
    updateHud(f);
    draw(f);
  }

  function resize() {
    const cssSize = Math.max(160, Math.floor(stage.clientWidth));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    render();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  function draw(f) {
    if (!built || !canvas.width) return;
    const { size, terrain, cores } = built;
    const t = canvas.width / size;
    const gap = Math.max(1, t * 0.06);
    ctx.fillStyle = '#0a0d13';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < size * size; i++) {
      const owner = f.owner[i];
      if (terrain[i] === WALL) ctx.fillStyle = '#252d3c';
      else if (owner >= 0) {
        const [r, g, b] = RGB[owner];
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.22 + massStep(f.mass[i]) * 0.15})`;
      } else ctx.fillStyle = '#131926';
      ctx.fillRect((i % size) * t + gap / 2, Math.floor(i / size) * t + gap / 2, t - gap, t - gap);
    }

    cores.forEach((c, p) => {
      const [r, g, b] = RGB[p];
      const cx = (c % size + 0.5) * t, cy = (Math.floor(c / size) + 0.5) * t, s = t * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(8, 11, 17, 0.5)';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, t * 0.09);
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.stroke();
    });

    if (t >= 18 * (window.devicePixelRatio || 1)) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      for (let i = 0; i < size * size; i++) {
        const mass = f.mass[i];
        if (f.owner[i] < 0 || mass < 2) continue;
        ctx.font = `600 ${Math.round(t * (mass >= 1000 ? 0.28 : 0.34))}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(shortMass(mass), (i % size + 0.5) * t, (Math.floor(i / size) + 0.52) * t);
      }
    }

    for (let back = 0; back < ARROW_FADE.length; back++) {
      const k = frame - back;
      if (k < 1) break;
      const played = built.moveAt(k);
      if (!played) break;
      played.moves.forEach((move, p) => {
        if (!move) return;
        const [r, g, b] = RGB[p];
        const [dx, dy] = STEP_XY[move.dir];
        const amount = played.amounts[p];
        const x0 = (move.from % size + 0.5) * t, y0 = (Math.floor(move.from / size) + 0.5) * t;
        const x1 = x0 + dx * t * 0.72, y1 = y0 + dy * t * 0.72;
        const width = t * (0.06 + 0.05 * Math.log10(1 + amount));
        const head = width * 1.8;
        ctx.globalAlpha = ARROW_FADE[back];
        ctx.strokeStyle = ctx.fillStyle = `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1 - dx * head * 0.6, y1 - dy * head * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - dx * head - dy * head * 0.8, y1 - dy * head - dx * head * 0.8);
        ctx.lineTo(x1 - dx * head + dy * head * 0.8, y1 - dy * head + dx * head * 0.8);
        ctx.closePath();
        ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
  }

  function updateHud(f) {
    const tiles = [0, 0], mass = [0, 0];
    let open = 0;
    for (let i = 0; i < f.owner.length; i++) {
      const o = f.owner[i];
      if (o >= 0) { tiles[o]++; mass[o] += f.mass[i]; }
      else if (built.terrain[i] !== WALL) open++;
    }
    territory[0].style.flexGrow = String(tiles[0]);
    territory[1].style.flexGrow = String(open);
    territory[2].style.flexGrow = String(tiles[1]);
    territory[0].textContent = String(tiles[0]);
    territory[2].textContent = String(tiles[1]);
    sides.forEach((s, p) => { s.stats.textContent = `${tiles[p]} tiles · ${shortMass(mass[p])} mass`; });
    tickLabel.textContent = `tick ${f.tick} / ${built.rules.maxTicks}`;
    scrub.value = String(frame);
    banner.hidden = !(built.result && frame === built.length);
  }

  function loop(now) {
    raf = 0;
    if (!playing || !built) return;
    if (lastTime) pendingTicks += ((now - lastTime) / 1000) * TICKS_PER_SECOND * speed;
    lastTime = now;
    const steps = Math.floor(pendingTicks);
    if (steps > 0) {
      pendingTicks -= steps;
      seek(frame + steps);
    }
    if (frame >= built.length) {
      pause();
      emit('end', built.result);
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  function play() {
    if (!built) return;
    if (frame >= built.length) seek(0);
    playing = true;
    lastTime = 0;
    pendingTicks = 0;
    playButton.textContent = '❚❚';
    playButton.setAttribute('aria-label', 'Pause');
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function pause() {
    playing = false;
    playButton.textContent = '▶';
    playButton.setAttribute('aria-label', 'Play');
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  const toggle = () => (playing ? pause() : play());

  function seek(k) {
    if (!built) return;
    frame = Math.max(0, Math.min(built.length, Math.round(k) || 0));
    render();
    emit('tick', frame);
  }

  function setSpeed(multiplier) {
    speed = multiplier;
    speedSelect.value = String(multiplier);
  }

  function load(replay) {
    pause();
    built = buildReplay(replay);
    built.names = (built.names || []).map((n) => String(n ?? 'bot').slice(0, 40));
    sides.forEach((s, p) => { s.name.textContent = built.names[p]; });
    const r = built.result;
    banner.className = `sv-banner${r && r.winner >= 0 ? ` sv-win-p${r.winner}` : ''}`;
    banner.textContent = !r ? '' : r.winner === -1 ? `Draw: ${r.reason}` : `${built.names[r.winner]} wins: ${r.reason} at tick ${r.tick}`;
    banner.hidden = true;
    scrub.max = String(built.length);
    seek(0);
    emit('load', built);
    if (autoplay) play();
  }

  scrub.addEventListener('input', () => { pause(); seek(Number(scrub.value)); });
  root.addEventListener('keydown', (e) => {
    if (e.target !== root && e.target.tagName !== 'BUTTON') return;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); pause(); seek(frame - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); pause(); seek(frame + 1); }
  });

  return {
    load, play, pause, toggle, seek, setSpeed,
    on(event, fn) { listeners[event]?.push(fn); },
    destroy() {
      pause();
      observer.disconnect();
      for (const key of Object.keys(listeners)) listeners[key] = [];
      root.remove();
    },
  };
}
