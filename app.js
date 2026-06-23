// === STATE ===
let state = {
  videoFilename: null,
  videoTitle: null,
  segmentCount: 0
};

// === UTILS ===
function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes/1024).toFixed(0)} KB`;
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('error-msg').classList.add('hidden');
}

function setLoading(btnId, textId, spinnerId, loading) {
  const btn = document.getElementById(btnId);
  const text = document.getElementById(textId);
  const spinner = document.getElementById(spinnerId);
  btn.disabled = loading;
  text.classList.toggle('hidden', loading);
  spinner.classList.toggle('hidden', !loading);
}

function showSection(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideSection(id) {
  document.getElementById(id).classList.add('hidden');
}

// === STEP 1: DOWNLOAD ===
async function startDownload() {
  const url = document.getElementById('url-input').value.trim();
  if (!url) {
    showError('Colle un lien vidéo d\'abord.');
    return;
  }
  hideError();
  setLoading('btn-download', 'btn-download-text', 'btn-download-spinner', true);

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showError(data.error || 'Erreur lors du téléchargement.');
      return;
    }

    state.videoFilename = data.filename;
    state.videoTitle = data.title;

    // Fill info
    document.getElementById('info-platform').textContent = data.platform || 'Vidéo';
    document.getElementById('info-title').textContent = data.title || 'Sans titre';
    document.getElementById('info-duration').textContent = formatDuration(data.duration);

    // Set video player
    const player = document.getElementById('video-player');
    player.src = data.preview_url;
    player.load();

    // Init segments
    document.getElementById('segments-list').innerHTML = '';
    state.segmentCount = 0;
    addSegment();

    showSection('section-editor');
    document.getElementById('section-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    showError('Erreur réseau. Vérifie ta connexion.');
  } finally {
    setLoading('btn-download', 'btn-download-text', 'btn-download-spinner', false);
  }
}

// === STEP 2: SEGMENTS ===
function addSegment() {
  state.segmentCount++;
  const id = state.segmentCount;
  const list = document.getElementById('segments-list');

  const row = document.createElement('div');
  row.className = 'segment-row';
  row.id = `segment-${id}`;
  row.innerHTML = `
    <div class="segment-field">
      <label>Début</label>
      <input type="text" id="seg-start-${id}" placeholder="0:00" />
    </div>
    <div class="segment-field">
      <label>Fin</label>
      <input type="text" id="seg-end-${id}" placeholder="1:30" />
    </div>
    <div class="segment-field">
      <label>Nom du clip</label>
      <input type="text" id="seg-label-${id}" placeholder="clip-${id}" value="clip-${id}" />
    </div>
    <button class="btn-remove" onclick="removeSegment(${id})" title="Supprimer">✕</button>
  `;
  list.appendChild(row);

  // Stamp current video time as start
  const player = document.getElementById('video-player');
  if (player && player.currentTime > 0) {
    document.getElementById(`seg-start-${id}`).value = formatDuration(Math.floor(player.currentTime));
  }
}

function removeSegment(id) {
  const el = document.getElementById(`segment-${id}`);
  if (el) el.remove();
}

function getSegments() {
  const rows = document.querySelectorAll('.segment-row');
  return Array.from(rows).map(row => {
    const id = row.id.replace('segment-', '');
    return {
      start: document.getElementById(`seg-start-${id}`)?.value.trim() || '0',
      end: document.getElementById(`seg-end-${id}`)?.value.trim() || '',
      label: document.getElementById(`seg-label-${id}`)?.value.trim() || `clip-${id}`
    };
  }).filter(s => s.end !== '');
}

// === STEP 3: CLIP ===
async function startClipping() {
  const segments = getSegments();
  if (segments.length === 0) {
    alert('Remplis au moins un segment avec un début et une fin.');
    return;
  }
  if (!state.videoFilename) {
    alert('Aucune vidéo chargée.');
    return;
  }

  setLoading('btn-clip', 'btn-clip-text', 'btn-clip-spinner', true);

  try {
    const res = await fetch('/api/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: state.videoFilename, segments })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.error || 'Erreur lors du découpage.');
      return;
    }

    renderClips(data.clips);
    showSection('section-results');
    document.getElementById('section-results').scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Cleanup source video
    fetch('/api/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: state.videoFilename })
    }).catch(() => {});

  } catch (err) {
    alert('Erreur réseau. Réessaie.');
  } finally {
    setLoading('btn-clip', 'btn-clip-text', 'btn-clip-spinner', false);
  }
}

function renderClips(clips) {
  const list = document.getElementById('clips-list');
  list.innerHTML = '';

  clips.forEach(clip => {
    const card = document.createElement('div');
    card.className = 'clip-card' + (clip.error ? ' error' : '');

    if (clip.error) {
      card.innerHTML = `
        <div class="clip-info">
          <div class="clip-label">${clip.label}</div>
          <div class="clip-error-msg">⚠ ${clip.error}</div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="clip-info">
          <div class="clip-label">${clip.label}</div>
          <div class="clip-meta">${clip.start} → ${clip.end || 'fin'} · ${formatBytes(clip.size)}</div>
        </div>
        <a class="btn-download-clip" href="${clip.download_url}" download="${clip.filename}">
          ↓ Télécharger
        </a>
      `;
    }

    list.appendChild(card);
  });
}

// === NAVIGATION ===
function backToEditor() {
  hideSection('section-results');
}

function resetAll() {
  state.videoFilename = null;
  state.videoTitle = null;
  state.segmentCount = 0;

  document.getElementById('url-input').value = '';
  document.getElementById('video-player').src = '';
  document.getElementById('segments-list').innerHTML = '';
  document.getElementById('clips-list').innerHTML = '';

  hideError();
  hideSection('section-editor');
  hideSection('section-results');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === KEYBOARD SHORTCUT ===
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement?.id === 'url-input') {
    startDownload();
  }
});
