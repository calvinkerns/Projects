// Replay viewer: canvas board, HUD, timeline and controls for one Surge replay.

import { W, N, WALL, WELL, CORE, replayFrames, visibilityOf } from './engine.js';

const RGB = [[255, 138, 61], [60, 200, 255]];
const MASS_STEPS = [0, 4, 12, 30, 80, 200];
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
    const name = el('div', 'sv-name', box, '—');
    const meter = el('div', 'sv-energy', box);
    const fill = el('div', 'sv-energy-fill', meter);
    const label = el('div', 'sv-energy-label', box);
    return { box, name, fill, label };
  };
  const side0 = makeSide(0);
  const tickLabel = el('div', 'sv-tick', hud, 'tick 0');
  const sides = [side0, makeSide(1)];

  const bars = el('div', 'sv-bars', root);
  const territory = [el('div', 'sv-bar sv-bar-p0', bars), el('div', 'sv-bar sv-bar-n', bars), el('div', 'sv-bar sv-bar-p1', bars)];

  const stage = el('div', 'sv-stage', root);
  const canvas = el('canvas', 'sv-board', stage);
  const banner = el('div', 'sv-banner', stage);
  banner.hidden = true;
  const ctx = canvas.getContext('2d');

  const timeline = el('div', 'sv-timeline', root);
  const pips = el('div', 'sv-pips', timeline);
  const scrub = el('input', 'sv-scrub', timeline);
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
  for (const s of [0.5, 1, 2, 4]) el('option', null, speedSelect, `${s}×`).value = String(s);
  speedSelect.value = '1';
  speedSelect.addEventListener('change', () => setSpeed(Number(speedSelect.value)));

  const fogSelect = el('select', 'sv-select', controls);
  fogSelect.setAttribute('aria-label', 'View');
  const fogOptions = [['all', 'Spectator view'], ['0', 'Player 1 view'], ['1', 'Player 2 view']].map(([value, text]) => {
    const o = el('option', null, fogSelect, text);
    o.value = value;
    return o;
  });
  fogSelect.addEventListener('change', () => setFog(fogSelect.value === 'all' ? 'all' : Number(fogSelect.value)));

  let built = null;
  let frame = 0;
  let playing = false;
  let speed = 1;
  let fog = 'all';
  let raf = 0;
  let lastTime = 0;
  let pendingTicks = 0;
  let visCache = new Map();
  let hatch = null;
  const listeners = { tick: [], end: [], load: [] };
  const emit = (event, value) => listeners[event].forEach((fn) => fn(value));

  function resize() {
    const cssSize = Math.max(160, Math.floor(stage.clientWidth));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    hatch = null;
    draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  function fogPattern() {
    if (hatch) return hatch;
    const size = Math.max(4, Math.round(canvas.width / W / 4));
    const tile = document.createElement('canvas');
    tile.width = tile.height = size;
    const g = tile.getContext('2d');
    g.fillStyle = '#080b11';
    g.fillRect(0, 0, size, size);
    g.strokeStyle = 'rgba(130, 150, 185, 0.16)';
    g.lineWidth = Math.max(1, size / 6);
    g.beginPath();
    g.moveTo(0, size);
    g.lineTo(size, 0);
    g.stroke();
    hatch = ctx.createPattern(tile, 'repeat');
    return hatch;
  }

  function visibility(k) {
    if (fog === 'all') return null;
    const key = k * 2 + fog;
    if (!visCache.has(key)) visCache.set(key, visibilityOf(built.frames[k].owner, fog, built.rules.vision));
    return visCache.get(key);
  }

  function draw() {
    if (!built || !canvas.width) return;
    const f = built.frames[frame];
    const vis = visibility(frame);
    const t = canvas.width / W;
    const gap = Math.max(1, t * 0.07);
    ctx.fillStyle = '#0a0d13';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < N; i++) {
      const x = (i % W) * t;
      const y = Math.floor(i / W) * t;
      const terrain = built.terrain[i];
      if (terrain === WALL) {
        ctx.fillStyle = '#252d3c';
        ctx.fillRect(x + gap / 2, y + gap / 2, t - gap, t - gap);
        continue;
      }
      const seen = !vis || vis[i] === 1;
      const owner = seen ? f.owner[i] : -1;
      if (!seen) {
        ctx.fillStyle = fogPattern();
        ctx.fillRect(x, y, t, t);
      } else {
        if (owner >= 0) {
          const [r, g, b] = RGB[owner];
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.22 + massStep(f.mass[i]) * 0.15})`;
        } else {
          ctx.fillStyle = '#131926';
        }
        ctx.fillRect(x + gap / 2, y + gap / 2, t - gap, t - gap);
      }

      const cx = x + t / 2, cy = y + t / 2;
      if (terrain === WELL) {
        ctx.beginPath();
        ctx.arc(cx, cy, t * 0.3, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1, t * 0.07);
        ctx.strokeStyle = owner >= 0 ? 'rgba(255, 255, 255, 0.85)' : 'rgba(150, 162, 185, 0.7)';
        ctx.stroke();
      } else if (terrain === CORE) {
        const coreOwner = built.cores.indexOf(i);
        const [r, g, b] = RGB[coreOwner];
        const s = t * 0.36;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy);
        ctx.closePath();
        ctx.lineWidth = Math.max(1.5, t * 0.09);
        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillStyle = 'rgba(8, 11, 17, 0.55)';
        ctx.fill();
        ctx.stroke();
      }

      const mass = f.mass[i];
      const showNumber = seen && mass >= 2 && (owner >= 0 || terrain === WELL);
      if (showNumber && t >= 20 * (window.devicePixelRatio || 1)) {
        ctx.fillStyle = owner >= 0 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(190, 200, 220, 0.8)';
        ctx.font = `600 ${Math.round(t * (mass >= 1000 ? 0.28 : 0.34))}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shortMass(mass), cx, cy + t * 0.02);
      }
    }

    for (let back = 0; back < ARROW_FADE.length; back++) {
      const k = frame - back;
      if (k < 1) break;
      const prev = built.frames[k - 1];
      built.frames[k].orders.forEach((orders, p) => {
        const [r, g, b] = RGB[p];
        for (const o of orders) {
          const [dx, dy] = STEP_XY[o.dir];
          const to = o.from + dx + dy * W;
          if (vis && !(vis[o.from] && vis[to])) continue;
          const amount = o.all ? prev.mass[o.from] : prev.mass[o.from] >> 1;
          const x0 = (o.from % W + 0.5) * t, y0 = (Math.floor(o.from / W) + 0.5) * t;
          const x1 = x0 + dx * t * 0.72, y1 = y0 + dy * t * 0.72;
          const width = t * (0.06 + 0.05 * Math.log10(1 + amount));
          const head = width * 1.8;
          ctx.globalAlpha = ARROW_FADE[back];
          ctx.strokeStyle = `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`;
          ctx.fillStyle = ctx.strokeStyle;
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
        }
      });
    }
    ctx.globalAlpha = 1;
  }

  function updateHud() {
    const f = built.frames[frame];
    const tiles = [0, 0];
    let neutral = 0;
    for (let i = 0; i < N; i++) {
      if (f.owner[i] >= 0) tiles[f.owner[i]]++;
      else if (built.terrain[i] !== WALL) neutral++;
    }
    territory[0].style.flexGrow = String(tiles[0]);
    territory[1].style.flexGrow = String(neutral);
    territory[2].style.flexGrow = String(tiles[1]);
    territory[0].textContent = String(tiles[0]);
    territory[2].textContent = String(tiles[1]);

    sides.forEach((s, p) => {
      const hidden = fog !== 'all' && fog !== p;
      s.fill.style.width = hidden ? '0%' : `${(100 * f.energy[p]) / built.rules.energyCap}%`;
      s.label.textContent = hidden ? 'energy ?' : `energy ${f.energy[p]} / ${built.rules.energyCap}`;
      s.box.classList.toggle('sv-surge', !hidden && frame > 0 && f.orders[p].length >= 4);
    });
    tickLabel.textContent = `tick ${f.tick}`;
    scrub.value = String(frame);
    banner.hidden = !(built.result && frame === built.frames.length - 1);
  }

  function buildPips() {
    pips.replaceChildren();
    const last = built.frames.length - 1;
    const add = (k, className, title) => {
      const pip = el('button', `sv-pip ${className}`, pips);
      pip.type = 'button';
      pip.title = title;
      pip.setAttribute('aria-label', title);
      pip.style.left = `${(100 * k) / Math.max(1, last)}%`;
      pip.addEventListener('click', () => { pause(); seek(k); });
    };
    const lastSurge = [-99, -99];
    for (let k = 1; k <= last; k++) {
      const before = built.frames[k - 1], now = built.frames[k];
      for (const w of built.wells) {
        const o = now.owner[w];
        if (o >= 0 && o !== before.owner[w]) add(k, `sv-pip-p${o}`, `${built.names[o]} took a well (tick ${k})`);
      }
      for (const p of [0, 1]) {
        if (now.orders[p].length >= 4 && before.energy[p] >= 15 && k - lastSurge[p] > 10) {
          lastSurge[p] = k;
          add(k, `sv-pip-surge sv-pip-p${p}`, `${built.names[p]} surged (tick ${k})`);
        }
      }
    }
    if (built.result) add(last, 'sv-pip-end', 'Result');
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
    if (frame >= built.frames.length - 1) {
      pause();
      emit('end', built.result);
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  function play() {
    if (!built) return;
    if (frame >= built.frames.length - 1) seek(0);
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
    frame = Math.max(0, Math.min(built.frames.length - 1, Math.round(k) || 0));
    updateHud();
    draw();
    emit('tick', built.frames[frame].tick);
  }

  function setSpeed(multiplier) {
    speed = multiplier;
    speedSelect.value = String(multiplier);
  }

  function setFog(mode) {
    fog = mode === 'all' ? 'all' : Number(mode) === 1 ? 1 : 0;
    fogSelect.value = String(fog);
    if (built) { updateHud(); draw(); }
  }

  function load(replay) {
    pause();
    built = replayFrames(replay);
    built.names = (built.names || []).map((n) => String(n ?? 'bot').slice(0, 40));
    visCache = new Map();
    sides.forEach((s, p) => { s.name.textContent = built.names[p]; });
    fogOptions[1].textContent = `${built.names[0]}'s view`;
    fogOptions[2].textContent = `${built.names[1]}'s view`;
    const r = built.result;
    banner.className = `sv-banner${r && r.winner >= 0 ? ` sv-win-p${r.winner}` : ''}`;
    banner.textContent = !r ? '' : r.winner === -1 ? `Draw: ${r.reason}` : `${built.names[r.winner]} wins: ${r.reason} at tick ${r.tick}`;
    banner.hidden = true;
    scrub.max = String(built.frames.length - 1);
    buildPips();
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
    else if (e.key === '1') setFog('all');
    else if (e.key === '2') setFog(0);
    else if (e.key === '3') setFog(1);
  });

  return {
    load, play, pause, toggle, seek, setSpeed, setFog,
    on(event, fn) { listeners[event]?.push(fn); },
    destroy() {
      pause();
      observer.disconnect();
      for (const key of Object.keys(listeners)) listeners[key] = [];
      root.remove();
    },
  };
}
