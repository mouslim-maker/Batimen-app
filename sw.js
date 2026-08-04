/* ================= CONFIG LOCALE (par appareil) ================= */
const LS = {
  url: 'batimen_apps_script_url',
  technicien: 'batimen_technicien',
  pin_ok: 'batimen_session_ok',
  logo: 'batimen_logo',
  queue: 'batimen_file_attente'
};

function getUrl() { return localStorage.getItem(LS.url); }
function getTechnicien() { return localStorage.getItem(LS.technicien); }

/* ================= APPEL API ================= */
async function api(action, params) {
  const url = getUrl();
  if (!url) throw new Error('Connecteur non configuré');
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ action: action, params: params || {} })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Erreur inconnue');
  return json.data;
}

/* ================= FILE D'ATTENTE HORS-LIGNE ================= */
function getQueue() { return JSON.parse(localStorage.getItem(LS.queue) || '[]'); }
function setQueue(q) { localStorage.setItem(LS.queue, JSON.stringify(q)); }

function enqueueDepense(depense) {
  const q = getQueue();
  q.push(depense);
  setQueue(q);
}

async function flushQueue() {
  const q = getQueue();
  if (q.length === 0) return;
  setSyncStatus('Synchronisation en cours…');
  const restant = [];
  for (const dep of q) {
    try {
      await api('postDepense', dep);
    } catch (e) {
      restant.push(dep); // on garde en attente si l'envoi échoue
    }
  }
  setQueue(restant);
  setSyncStatus(restant.length === 0 ? 'Connecté' : `Connecté (${restant.length} en attente)`);
}

function setSyncStatus(txt) {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = '●  ' + txt;
  localStorage.setItem('batimen_last_sync', new Date().toLocaleString('fr-FR'));
}

window.addEventListener('online', flushQueue);

/* ================= UUID ================= */
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/* ================= NAVIGATION ================= */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById('page-' + name).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === name));
}
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showPage(btn.dataset.page);
    if (btn.dataset.page === 'liste') chargerListe();
    if (btn.dataset.page === 'nonaffectees') chargerNonAffectees();
  });
});
document.getElementById('btn-goto-scan').addEventListener('click', () => {
  showPage('depense');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === 'depense'));
});

/* ================= ÉCRAN 1 : PREMIER LANCEMENT ================= */
function bootstrap() {
  if (!getUrl()) {
    document.getElementById('screen-setup').classList.remove('hidden');
    return;
  }
  if (localStorage.getItem(LS.pin_ok) !== '1') {
    document.getElementById('screen-pin').classList.remove('hidden');
    return;
  }
  lancerApp();
}

document.getElementById('btn-save-url').addEventListener('click', () => {
  const val = document.getElementById('input-url').value.trim();
  if (!val) return;
  localStorage.setItem(LS.url, val);
  document.getElementById('screen-setup').classList.add('hidden');
  document.getElementById('screen-pin').classList.remove('hidden');
});

/* ================= ÉCRAN 2 : PIN ================= */
document.getElementById('btn-login').addEventListener('click', async () => {
  const pin = document.getElementById('input-pin').value.trim();
  const errEl = document.getElementById('pin-error');
  errEl.textContent = '';
  try {
    const res = await api('checkPin', { pin: pin });
    localStorage.setItem(LS.technicien, res.nom);
    localStorage.setItem(LS.pin_ok, '1');
    document.getElementById('screen-pin').classList.add('hidden');
    lancerApp();
  } catch (e) {
    errEl.textContent = e.message;
  }
});

/* ================= LANCEMENT APP PRINCIPALE ================= */
async function lancerApp() {
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('greeting').textContent = 'Bonjour ' + (getTechnicien() || '');
  document.getElementById('r-nom-technicien').value = getTechnicien() || '';
  document.getElementById('r-url').value = getUrl() || '';
  document.getElementById('last-sync').textContent = 'Dernière synchro : ' + (localStorage.getItem('batimen_last_sync') || 'jamais');

  try {
    const marches = await api('getMarches');
    remplirMarches(marches);
    setSyncStatus('Connecté');
    flushQueue();
  } catch (e) {
    setSyncStatus('Erreur de synchronisation');
  }
}

function remplirMarches(marches) {
  const opts = m => marches.map(x => `<option value="${x.code}">${x.code} — ${x.intitule}</option>`).join('');
  ['select-marche', 'f-marche', 'admin-select-marche'].forEach(id => {
    const el = document.getElementById(id);
    el.innerHTML = '<option value="">Choisir un marché…</option>' + opts();
  });
}

/* ================= TABLEAU DE BORD (accueil) ================= */
document.getElementById('select-marche').addEventListener('change', async (e) => {
  const code = e.target.value;
  const selectLot = document.getElementById('select-lot');
  document.getElementById('dashboard-box').classList.add('hidden');
  if (!code) { selectLot.disabled = true; selectLot.innerHTML = '<option value="">Choisir d\'abord un marché</option>'; return; }
  const lots = await api('getLots', { codeMarche: code });
  selectLot.disabled = false;
  selectLot.innerHTML = '<option value="">Choisir un lot…</option>' +
    lots.map(l => `<option value="${l.lot}">${l.lot} — ${l.intituleLot}</option>`).join('');
});

document.getElementById('select-lot').addEventListener('change', async (e) => {
  const lot = e.target.value;
  const code = document.getElementById('select-marche').value;
  if (!lot) return;
  const db = await api('getTableauBord', { codeMarche: code, lot: lot });
  afficherDashboard(db);
});

function eur(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }

function afficherDashboard(db) {
  document.getElementById('dashboard-box').classList.remove('hidden');
  document.getElementById('db-code').textContent = db.codeMarche + ' — ' + db.lot;
  document.getElementById('db-intitule').textContent = db.intitule;
  document.getElementById('db-budget').textContent = eur(db.budget);
  document.getElementById('db-payees').textContent = eur(db.payees);
  document.getElementById('db-engagees').textContent = eur(db.engagees);
  document.getElementById('db-total').textContent = eur(db.totalEngage);
  document.getElementById('db-restant').textContent = eur(db.restant);
  document.getElementById('db-pct').textContent = db.pct.toFixed(1) + ' %';
  const header = document.getElementById('dashboard-couleur');
  header.className = 'dashboard-header ' + db.couleur;
}

/* ================= FORMULAIRE NOUVELLE DÉPENSE ================= */
document.getElementById('f-marche').addEventListener('change', async (e) => {
  const code = e.target.value;
  const selectLot = document.getElementById('f-lot');
  const selectPoste = document.getElementById('f-poste');
  document.getElementById('f-recap').classList.add('hidden');
  if (!code) {
    selectLot.disabled = true; selectLot.innerHTML = '<option value="">Choisir d\'abord un marché</option>';
    selectPoste.disabled = true; selectPoste.innerHTML = '<option value="">Choisir d\'abord un marché</option>';
    return;
  }
  const [lots, postes] = await Promise.all([
    api('getLots', { codeMarche: code }),
    api('getPostes', { codeMarche: code })
  ]);
  selectLot.disabled = false;
  selectLot.innerHTML = '<option value="">Choisir un lot…</option>' +
    lots.map(l => `<option value="${l.lot}" data-intitule="${l.intituleLot}" data-budget="${l.budget}">${l.lot} — ${l.intituleLot}</option>`).join('');
  selectPoste.disabled = false;
  selectPoste.innerHTML = '<option value="">Choisir un poste…</option>' +
    postes.map(p => `<option value="${p}">${p}</option>`).join('');
});

document.getElementById('f-lot').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  if (!opt || !opt.value) { document.getElementById('f-recap').classList.add('hidden'); return; }
  document.getElementById('f-recap').classList.remove('hidden');
  document.getElementById('f-recap-chantier').textContent = opt.dataset.intitule;
  document.getElementById('f-recap-budget').textContent = eur(opt.dataset.budget);
  majVerification();
});
document.getElementById('f-marche').addEventListener('change', majVerification);

function majVerification() {
  const marcheOpt = document.getElementById('f-marche').selectedOptions[0];
  const lotOpt = document.getElementById('f-lot').selectedOptions[0];
  document.getElementById('v-marche').textContent = marcheOpt && marcheOpt.value ? marcheOpt.value : '-';
  document.getElementById('v-lot').textContent = lotOpt && lotOpt.value ? lotOpt.value : '-';
  document.getElementById('v-chantier').textContent = lotOpt && lotOpt.dataset.intitule ? lotOpt.dataset.intitule : '-';
  document.getElementById('v-budget').textContent = lotOpt && lotOpt.dataset.budget ? eur(lotOpt.dataset.budget) : '-';
}

let photoBase64 = null, photoNom = null;
document.getElementById('f-photo').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  photoNom = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    photoBase64 = reader.result;
    const img = document.getElementById('f-photo-preview');
    img.src = photoBase64;
    img.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

document.getElementById('form-depense').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById('depense-msg');
  msgEl.textContent = '';

  const marcheOpt = document.getElementById('f-marche').selectedOptions[0];
  const lotOpt = document.getElementById('f-lot').selectedOptions[0];

  const depense = {
    uuid: uuidv4(),
    date: document.getElementById('f-date').value,
    codeMarche: document.getElementById('f-marche').value,
    lot: document.getElementById('f-lot').value,
    chantier: lotOpt ? lotOpt.dataset.intitule : '',
    fournisseur: document.getElementById('f-fournisseur').value,
    numFacture: document.getElementById('f-numfacture').value,
    poste: document.getElementById('f-poste').value,
    nature: document.getElementById('f-nature').value,
    montant: document.getElementById('f-montant').value,
    statut: document.getElementById('f-statut').value,
    technicien: getTechnicien(),
    photoBase64: photoBase64,
    photoNom: photoNom
  };

  if (!depense.codeMarche || !depense.lot) {
    msgEl.textContent = 'Choisis un marché et un lot.';
    return;
  }

  try {
    await api('postDepense', depense);
    msgEl.textContent = 'Dépense enregistrée et synchronisée.';
    document.getElementById('form-depense').reset();
    document.getElementById('f-recap').classList.add('hidden');
    document.getElementById('f-photo-preview').classList.add('hidden');
    photoBase64 = null;
  } catch (e2) {
    // pas de réseau ou erreur serveur : on met en file d'attente locale
    enqueueDepense(depense);
    msgEl.textContent = 'Pas de connexion — dépense enregistrée sur le téléphone, elle sera envoyée automatiquement.';
    document.getElementById('form-depense').reset();
  }
});

/* ================= LISTE DES DÉPENSES ================= */
async function chargerListe() {
  const el = document.getElementById('liste-depenses');
  el.innerHTML = 'Chargement…';
  try {
    const deps = await api('getAllDepenses');
    el.innerHTML = deps.slice().reverse().map(d => `
      <div class="depense-item">
        <div class="top-row"><span>${d.fournisseur || ''}</span><span>${eur(d.montant)}</span></div>
        <div class="sub-row">${d.codeMarche || ''} · ${d.lot || 'sans lot'} · ${d.poste || ''} · ${d.statut || ''}</div>
      </div>`).join('') || '<p class="muted">Aucune dépense.</p>';
  } catch (e) {
    el.innerHTML = '<p class="error">Erreur de chargement.</p>';
  }
}

/* ================= ACTUALISATION MANUELLE ================= */
document.getElementById('btn-refresh-accueil').addEventListener('click', async () => {
  const code = document.getElementById('select-marche').value;
  const lot = document.getElementById('select-lot').value;
  setSyncStatus('Synchronisation en cours…');
  try {
    if (code && lot) {
      const db = await api('getTableauBord', { codeMarche: code, lot: lot });
      afficherDashboard(db);
    } else {
      const marches = await api('getMarches');
      remplirMarches(marches);
    }
    setSyncStatus('Connecté');
  } catch (e) {
    setSyncStatus('Erreur de synchronisation');
  }
});

document.getElementById('btn-refresh-nonaffectees').addEventListener('click', chargerNonAffectees);

/* ================= DÉPENSES NON AFFECTÉES ================= */
async function chargerNonAffectees() {
  const el = document.getElementById('liste-nonaffectees');
  el.innerHTML = 'Chargement…';
  try {
    const deps = await api('getDepensesNonAffectees');
    if (deps.length === 0) { el.innerHTML = '<p class="muted">Aucune dépense en attente d\'affectation.</p>'; return; }
    el.innerHTML = '';
    for (const d of deps) {
      const lots = await api('getLots', { codeMarche: d.codeMarche });
      const div = document.createElement('div');
      div.className = 'depense-item';
      div.innerHTML = `
        <div class="top-row"><span>${d.fournisseur || ''}</span><span>${eur(d.montant)}</span></div>
        <div class="sub-row">${d.codeMarche}</div>
        <select data-id="${d.id}">
          <option value="">Choisir le lot…</option>
          ${lots.map(l => `<option value="${l.lot}">${l.lot} — ${l.intituleLot}</option>`).join('')}
        </select>`;
      div.querySelector('select').addEventListener('change', async (ev) => {
        await api('affecterLot', { idDepense: d.id, lot: ev.target.value });
        chargerNonAffectees();
      });
      el.appendChild(div);
    }
  } catch (e) {
    el.innerHTML = '<p class="error">Erreur de chargement.</p>';
  }
}

/* ================= ADMINISTRATION : POSTES BUDGÉTAIRES ================= */
document.getElementById('admin-select-marche').addEventListener('change', async (e) => {
  const code = e.target.value;
  const ul = document.getElementById('admin-postes-liste');
  ul.innerHTML = '';
  if (!code) return;
  const postes = await api('getPostes', { codeMarche: code });
  ul.innerHTML = postes.map(p => `<li>${p}</li>`).join('') || '<li class="muted">Aucun poste pour ce marché</li>';
});

document.getElementById('btn-add-poste').addEventListener('click', async () => {
  const code = document.getElementById('admin-select-marche').value;
  const poste = document.getElementById('admin-nouveau-poste').value.trim();
  const msg = document.getElementById('admin-msg');
  if (!code || !poste) { msg.textContent = 'Choisis un marché et saisis un poste.'; return; }
  try {
    await api('addPoste', { codeMarche: code, poste: poste });
    msg.textContent = 'Poste ajouté.';
    document.getElementById('admin-nouveau-poste').value = '';
    document.getElementById('admin-select-marche').dispatchEvent(new Event('change'));
  } catch (e) {
    msg.textContent = e.message;
  }
});

/* ================= RÉGLAGES ================= */
document.getElementById('btn-save-reglages').addEventListener('click', () => {
  localStorage.setItem(LS.url, document.getElementById('r-url').value.trim());
  localStorage.setItem(LS.technicien, document.getElementById('r-nom-technicien').value.trim());
  document.getElementById('greeting').textContent = 'Bonjour ' + getTechnicien();
  lancerApp();
});
document.getElementById('btn-sync-now').addEventListener('click', async () => {
  setSyncStatus('Synchronisation en cours…');
  try {
    await flushQueue();
    const marches = await api('getMarches');
    remplirMarches(marches);
    setSyncStatus('Connecté');
    document.getElementById('last-sync').textContent = 'Dernière synchro : ' + localStorage.getItem('batimen_last_sync');
  } catch (e) {
    setSyncStatus('Erreur de synchronisation');
  }
});
document.getElementById('btn-logout').addEventListener('click', () => {
  if (!confirm('Effacer les réglages de cet appareil (nom, connecteur, session) ?')) return;
  localStorage.clear();
  location.reload();
});

/* ================= SERVICE WORKER (installation + mise à jour) ================= */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          document.getElementById('update-banner').classList.remove('hidden');
        }
      });
    });
  });
}
document.getElementById('btn-update').addEventListener('click', () => {
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  });
});

/* ================= DÉMARRAGE ================= */
document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
bootstrap();
