const state = {
  clips: [],
  tracks: [
    { id: 'v1', type: 'video', name: 'Video 1' },
    { id: 'v2', type: 'video', name: 'Video 2' },
    { id: 'a1', type: 'audio', name: 'Audio 1' },
    { id: 'g1', type: 'graphic', name: 'Graphics' },
  ],
  selectedClipId: null,
  zoom: 2,
  snapping: true,
  transitions: new Map(),
  titles: [],
  trackingPoints: [],
  renderQueue: [],
  color: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, lut: 'none', lift: 0, gamma: 0, gain: 0 },
  mask: { x: 50, y: 50, r: 25 },
  fx: { chromaThreshold: 120, spill: 20, feather: 5, stabilization: 30 },
  audio: { musicVolume: 70, voiceVolume: 85, eqLow: 0, eqHigh: 0, compressor: 40, limiter: 60, noiseReduction: 20, sidechain: 50, mute: false, solo: false },
  multicam: { cameras: ['A'], active: 'A' }
};

const els = {
  mediaInput: document.getElementById('mediaInput'),
  importBtn: document.getElementById('importBtn'),
  timeline: document.getElementById('timeline'),
  selectionInfo: document.getElementById('selectionInfo'),
  timelineZoom: document.getElementById('timelineZoom'),
  snapping: document.getElementById('snapping'),
  sourceVideo: document.getElementById('sourceVideo'),
  previewCanvas: document.getElementById('previewCanvas'),
  previewQuality: document.getElementById('previewQuality'),
  playBtn: document.getElementById('playBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  cameraSelect: document.getElementById('cameraSelect'),
  waveform: document.getElementById('waveform'),
  vectorscope: document.getElementById('vectorscope'),
  renderQueue: document.getElementById('renderQueue'),
};

const ctx = els.previewCanvas.getContext('2d', { willReadFrequently: true });
const waveformCtx = els.waveform.getContext('2d');
const vectorscopeCtx = els.vectorscope.getContext('2d');
let raf;

function secondsToPx(seconds) { return seconds * 80 * state.zoom; }

function importMedia() {
  [...els.mediaInput.files].forEach((file, i) => {
    const type = file.type.startsWith('audio') ? 'audio' : (file.type.startsWith('image') ? 'graphic' : 'video');
    const track = state.tracks.find((t) => t.type === type) || state.tracks[0];
    const start = state.clips.filter((c) => c.trackId === track.id).reduce((acc, c) => Math.max(acc, c.start + c.duration), 0);
    const clip = {
      id: crypto.randomUUID(),
      name: file.name,
      trackId: track.id,
      type,
      start,
      duration: type === 'image' ? 5 : 8 + i,
      sourceOffset: 0,
      camera: type === 'video' ? String.fromCharCode(65 + (state.multicam.cameras.length % 3)) : 'A',
      file
    };
    state.clips.push(clip);
    if (type === 'video') {
      if (!state.multicam.cameras.includes(clip.camera)) state.multicam.cameras.push(clip.camera);
      if (!els.sourceVideo.src) els.sourceVideo.src = URL.createObjectURL(file);
    }
  });
  renderCameraSelect();
  drawTimeline();
}

function drawTimeline() {
  els.timeline.innerHTML = '';
  state.tracks.forEach((track) => {
    const row = document.createElement('div');
    row.className = 'track';
    row.style.minWidth = `${secondsToPx(60)}px`;
    row.innerHTML = `<div class="track-title">${track.name}</div>`;
    state.clips.filter((clip) => clip.trackId === track.id).forEach((clip) => {
      const clipEl = document.createElement('div');
      clipEl.className = `clip ${track.type} ${state.selectedClipId === clip.id ? 'selected' : ''}`;
      clipEl.textContent = `${clip.name} (${clip.camera || '-'})`;
      clipEl.style.left = `${secondsToPx(clip.start)}px`;
      clipEl.style.width = `${Math.max(30, secondsToPx(clip.duration))}px`;
      clipEl.onclick = () => { state.selectedClipId = clip.id; updateSelectionInfo(); drawTimeline(); };
      row.appendChild(clipEl);
    });
    els.timeline.appendChild(row);
  });
}

function selectedClip() { return state.clips.find((c) => c.id === state.selectedClipId); }

function updateSelectionInfo() {
  const clip = selectedClip();
  els.selectionInfo.textContent = clip
    ? `${clip.name} | t=${clip.start.toFixed(1)}s d=${clip.duration.toFixed(1)}s`
    : 'Sin clip seleccionado';
}

function splitClip() {
  const clip = selectedClip();
  if (!clip) return;
  const splitAt = clip.duration / 2;
  const first = { ...clip, id: crypto.randomUUID(), duration: splitAt };
  const second = { ...clip, id: crypto.randomUUID(), start: clip.start + splitAt, duration: clip.duration - splitAt, sourceOffset: clip.sourceOffset + splitAt };
  state.clips = state.clips.filter((c) => c.id !== clip.id).concat([first, second]);
  state.selectedClipId = first.id;
  drawTimeline();
  updateSelectionInfo();
}

function trimStart() { const c = selectedClip(); if (!c || c.duration <= 1) return; c.start += 0.5; c.duration -= 0.5; c.sourceOffset += 0.5; drawTimeline(); updateSelectionInfo(); }
function trimEnd() { const c = selectedClip(); if (!c || c.duration <= 1) return; c.duration -= 0.5; drawTimeline(); updateSelectionInfo(); }
function rippleEdit() {
  const c = selectedClip();
  if (!c) return;
  state.clips.filter((x) => x.trackId === c.trackId && x.start > c.start).forEach((x) => { x.start -= 0.5; });
  c.duration = Math.max(0.5, c.duration - 0.5);
  drawTimeline();
}
function slip() { const c = selectedClip(); if (!c) return; c.sourceOffset = Math.max(0, c.sourceOffset + 0.3); }
function slide() {
  const c = selectedClip(); if (!c) return;
  c.start += 0.5;
  const next = state.clips.find((x) => x.trackId === c.trackId && x.start > c.start && x.id !== c.id);
  if (next) next.start += state.snapping ? 0.5 : 0.37;
  drawTimeline(); updateSelectionInfo();
}

function applyTransition(type) {
  const c = selectedClip();
  if (!c) return;
  state.transitions.set(c.id, type);
}

function addTitle() {
  const txt = document.getElementById('titleText').value || 'Título';
  state.titles.push({
    id: crypto.randomUUID(),
    text: txt,
    preset: document.getElementById('titlePreset').value,
    in: Number(document.getElementById('titleIn').value),
    out: Number(document.getElementById('titleOut').value)
  });
}

function readSliders() {
  ['brightness','contrast','saturation','temperature','lift','gamma','gain'].forEach((k) => {
    state.color[k] = Number(document.getElementById(k).value);
  });
  state.color.lut = document.getElementById('lutSelect').value;
  ['maskX','maskY','maskR'].forEach((k) => state.mask[k.replace('mask','').toLowerCase()] = Number(document.getElementById(k).value));
  ['chromaThreshold','spill','feather','stabilization'].forEach((k) => state.fx[k] = Number(document.getElementById(k).value));
  ['musicVolume','voiceVolume','eqLow','eqHigh','compressor','limiter','noiseReduction','sidechain'].forEach((k) => state.audio[k] = Number(document.getElementById(k).value));
}

function renderFrame() {
  const video = els.sourceVideo;
  if (!video.src || video.readyState < 2) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, els.previewCanvas.width, els.previewCanvas.height);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('Importa un vídeo para previsualizar', 20, 30);
    requestAnimationFrame(renderFrame);
    return;
  }

  const quality = Number(els.previewQuality.value);
  const w = Math.floor(els.previewCanvas.width * quality);
  const h = Math.floor(els.previewCanvas.height * quality);

  const stab = state.fx.stabilization / 100;
  const jitterX = Math.sin(video.currentTime * 10) * 4 * (1 - stab);
  const jitterY = Math.cos(video.currentTime * 9) * 3 * (1 - stab);

  ctx.save();
  ctx.clearRect(0, 0, els.previewCanvas.width, els.previewCanvas.height);
  ctx.translate(jitterX, jitterY);
  ctx.drawImage(video, 0, 0, w, h, 0, 0, els.previewCanvas.width, els.previewCanvas.height);
  ctx.restore();

  applyColorAndKey();
  drawTitles(video.currentTime);
  drawTrackingOverlay(video.currentTime);
  drawScopes();
  raf = requestAnimationFrame(renderFrame);
}

function applyColorAndKey() {
  const img = ctx.getImageData(0, 0, els.previewCanvas.width, els.previewCanvas.height);
  const d = img.data;
  const sat = 1 + state.color.saturation / 100;
  const con = 1 + state.color.contrast / 100;
  const bri = state.color.brightness;
  const temp = state.color.temperature;
  const lift = state.color.lift / 100;
  const gamma = state.color.gamma / 100;
  const gain = state.color.gain / 100;
  const maskCx = els.previewCanvas.width * (state.mask.x / 100);
  const maskCy = els.previewCanvas.height * (state.mask.y / 100);
  const maskR = Math.min(els.previewCanvas.width, els.previewCanvas.height) * (state.mask.r / 100);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
    const x = (i / 4) % els.previewCanvas.width;
    const y = Math.floor((i / 4) / els.previewCanvas.width);
    const inMask = ((x - maskCx) ** 2 + (y - maskCy) ** 2) < maskR ** 2;

    r = ((r - 128) * con + 128) + bri + temp * 0.5;
    g = ((g - 128) * con + 128) + bri;
    b = ((b - 128) * con + 128) + bri - temp * 0.4;

    const avg = (r + g + b) / 3;
    r = avg + (r - avg) * sat;
    g = avg + (g - avg) * sat;
    b = avg + (b - avg) * sat;

    if (inMask) {
      r = r * (1 + gain) + lift * 40;
      g = g * (1 + gamma * 0.8);
      b = b * (1 + gain * 0.6);
    }

    if (state.color.lut === 'cinematic') { r *= 1.06; g *= 0.98; b *= 0.92; }
    if (state.color.lut === 'tealOrange') { r *= 1.1; g *= 1.02; b *= 0.85; }
    if (state.color.lut === 'vintage') { r *= 1.08; g *= 1.02; b *= 0.82; }

    const isGreen = g > r + state.fx.chromaThreshold * 0.2 && g > b + state.fx.chromaThreshold * 0.2;
    if (isGreen) {
      a = Math.max(0, a - state.fx.chromaThreshold + state.fx.feather * 2);
      g *= 1 - state.fx.spill / 100;
    }

    d[i] = Math.max(0, Math.min(255, r));
    d[i+1] = Math.max(0, Math.min(255, g));
    d[i+2] = Math.max(0, Math.min(255, b));
    d[i+3] = a;
  }
  ctx.putImageData(img, 0, 0);
}

function drawTitles(t) {
  state.titles.forEach((title) => {
    if (t < title.in || t > title.out) return;
    const alpha = Math.min(1, Math.max(0, (t - title.in) * 2, (title.out - t) * 2));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 8;
    if (title.preset === 'lowerThird') {
      ctx.fillRect(40, els.previewCanvas.height - 120, 460, 60);
      ctx.fillStyle = '#111';
      ctx.font = '28px sans-serif';
      ctx.fillText(title.text, 60, els.previewCanvas.height - 80);
    } else if (title.preset === 'headline') {
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(title.text, 50, 80);
    } else {
      ctx.font = '24px sans-serif';
      ctx.fillText(title.text, 60, els.previewCanvas.height - 40);
    }
    ctx.restore();
  });
}

function addTrackingPoint() {
  state.trackingPoints.push({ t: els.sourceVideo.currentTime || 0, x: Math.random() * 0.6 + 0.2, y: Math.random() * 0.5 + 0.2 });
  state.trackingPoints.sort((a,b) => a.t - b.t);
}

function drawTrackingOverlay(t) {
  if (!state.trackingPoints.length) return;
  let p = state.trackingPoints[0];
  for (let i = 0; i < state.trackingPoints.length - 1; i++) {
    const a = state.trackingPoints[i];
    const b = state.trackingPoints[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(0.001, (b.t - a.t));
      p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      break;
    }
  }
  const x = p.x * els.previewCanvas.width;
  const y = p.y * els.previewCanvas.height;
  ctx.save();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 60, y - 25, 120, 50);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('Objeto trackeado', x - 55, y - 30);
  ctx.restore();
}

function drawScopes() {
  const img = ctx.getImageData(0, 0, els.previewCanvas.width, els.previewCanvas.height).data;
  waveformCtx.fillStyle = '#000';
  waveformCtx.fillRect(0, 0, els.waveform.width, els.waveform.height);
  waveformCtx.fillStyle = '#22d3ee';

  vectorscopeCtx.fillStyle = '#000';
  vectorscopeCtx.fillRect(0,0,els.vectorscope.width, els.vectorscope.height);

  for (let x = 0; x < els.waveform.width; x++) {
    const srcX = Math.floor((x / els.waveform.width) * els.previewCanvas.width);
    const srcY = Math.floor(Math.random() * els.previewCanvas.height);
    const idx = (srcY * els.previewCanvas.width + srcX) * 4;
    const luma = 0.2126 * img[idx] + 0.7152 * img[idx+1] + 0.0722 * img[idx+2];
    waveformCtx.fillRect(x, els.waveform.height - (luma / 255) * els.waveform.height, 1, 1);

    const u = img[idx] - img[idx+1] + 128;
    const v = img[idx+2] - img[idx+1] + 128;
    vectorscopeCtx.fillStyle = `rgb(${img[idx]},${img[idx+1]},${img[idx+2]})`;
    vectorscopeCtx.fillRect(Math.max(0,Math.min(279,u)), Math.max(0,Math.min(99,v/2)), 1, 1);
  }
}

function renderCameraSelect() {
  els.cameraSelect.innerHTML = '';
  state.multicam.cameras.forEach((c) => {
    const o = document.createElement('option'); o.value = c; o.textContent = `Cam ${c}`; els.cameraSelect.appendChild(o);
  });
  els.cameraSelect.value = state.multicam.active;
}

function switchCamera() {
  state.multicam.active = els.cameraSelect.value;
  const clip = state.clips.find((c) => c.type === 'video' && c.camera === state.multicam.active);
  if (clip?.file) els.sourceVideo.src = URL.createObjectURL(clip.file);
}

function queueExport() {
  const preset = document.getElementById('exportPreset').value;
  const job = { id: crypto.randomUUID(), preset, format: preset.includes('MOV') ? 'MOV/H.265' : 'MP4/H.264', progress: 0 };
  state.renderQueue.push(job);
  renderQueueList();
}

function renderQueueList() {
  els.renderQueue.innerHTML = '';
  state.renderQueue.forEach((job) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${job.preset}</strong> (${job.format})<br/><progress value="${job.progress}" max="100"></progress> ${job.progress}%`;
    els.renderQueue.appendChild(li);
  });
}

async function startBatchRender() {
  for (const job of state.renderQueue) {
    while (job.progress < 100) {
      await new Promise((r) => setTimeout(r, 100));
      job.progress += 10;
      renderQueueList();
    }
  }
}

function applyTemplate() {
  const template = document.getElementById('templateSelect').value;
  if (template === 'introOutro') {
    state.titles.push({ id: crypto.randomUUID(), text: 'Bienvenidos a mi canal', preset: 'headline', in: 0, out: 3 });
    state.titles.push({ id: crypto.randomUUID(), text: 'Gracias por ver', preset: 'headline', in: 12, out: 16 });
  }
  if (template === 'gaming') {
    state.color.saturation = 25; document.getElementById('saturation').value = 25;
    state.titles.push({ id: crypto.randomUUID(), text: 'HIGHLIGHT!', preset: 'caption', in: 4, out: 8 });
  }
  if (template === 'cinema') {
    state.color.lut = 'cinematic';
    document.getElementById('lutSelect').value = 'cinematic';
    state.color.contrast = 18;
    document.getElementById('contrast').value = 18;
  }
}

function setupAudioEngine() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaElementSource(els.sourceVideo);
  const low = audioCtx.createBiquadFilter(); low.type = 'lowshelf';
  const high = audioCtx.createBiquadFilter(); high.type = 'highshelf';
  const comp = audioCtx.createDynamicsCompressor();
  const gain = audioCtx.createGain();
  src.connect(low); low.connect(high); high.connect(comp); comp.connect(gain); gain.connect(audioCtx.destination);

  function update() {
    low.gain.value = state.audio.eqLow;
    high.gain.value = state.audio.eqHigh;
    comp.threshold.value = -60 + state.audio.compressor * 0.5;
    comp.ratio.value = 1 + state.audio.limiter / 20;
    const voiceFactor = state.audio.solo ? 1 : 0.85;
    const side = 1 - (state.audio.sidechain / 100) * (state.audio.voiceVolume / 100);
    gain.gain.value = state.audio.mute ? 0 : (state.audio.musicVolume / 100) * side * voiceFactor;
  }

  document.querySelectorAll('#musicVolume,#voiceVolume,#eqLow,#eqHigh,#compressor,#limiter,#noiseReduction,#sidechain').forEach((el) => {
    el.addEventListener('input', () => { readSliders(); update(); });
  });
  document.getElementById('muteAudioBtn').onclick = () => { state.audio.mute = !state.audio.mute; update(); };
  document.getElementById('soloAudioBtn').onclick = () => { state.audio.solo = !state.audio.solo; update(); };
}

function bind() {
  els.importBtn.onclick = importMedia;
  els.timelineZoom.oninput = () => { state.zoom = Number(els.timelineZoom.value); drawTimeline(); };
  els.snapping.onchange = () => { state.snapping = els.snapping.checked; };

  document.getElementById('splitBtn').onclick = splitClip;
  document.getElementById('trimStartBtn').onclick = trimStart;
  document.getElementById('trimEndBtn').onclick = trimEnd;
  document.getElementById('rippleBtn').onclick = rippleEdit;
  document.getElementById('slipBtn').onclick = slip;
  document.getElementById('slideBtn').onclick = slide;

  document.querySelectorAll('.transitionBtn').forEach((btn) => btn.onclick = () => applyTransition(btn.dataset.transition));
  document.getElementById('addTitleBtn').onclick = addTitle;
  document.getElementById('addTrackPointBtn').onclick = addTrackingPoint;
  document.getElementById('queueExportBtn').onclick = queueExport;
  document.getElementById('startRenderBtn').onclick = startBatchRender;
  document.getElementById('applyTemplateBtn').onclick = applyTemplate;
  els.cameraSelect.onchange = switchCamera;

  document.querySelectorAll('input[type="range"],select').forEach((el) => el.addEventListener('input', readSliders));

  els.playBtn.onclick = async () => { await els.sourceVideo.play(); };
  els.pauseBtn.onclick = () => els.sourceVideo.pause();
  els.sourceVideo.onplay = () => renderFrame();
  els.sourceVideo.onpause = () => cancelAnimationFrame(raf);
}

bind();
drawTimeline();
updateSelectionInfo();
renderFrame();
setupAudioEngine();
