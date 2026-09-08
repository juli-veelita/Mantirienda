/* ============================================================
   FLORA — Restaurante de flores
   Flujo: recepción → menú virtual → cocina → mozo → cuenta → app de puntos
   ============================================================ */

const STORE = 'flora_v1';

const RANGOS = [
  { id: 'semilla',    nombre: 'Semilla',    icono: '🌱', min: 0,   desc: 0  },
  { id: 'capullo',    nombre: 'Capullo',    icono: '🌿', min: 100, desc: 5  },
  { id: 'floreciendo',nombre: 'Floreciendo',icono: '🌷', min: 300, desc: 10 },
  { id: 'flor',       nombre: 'Flor',       icono: '🌸', min: 600, desc: 15 }
];

const MENU = [
  { id: 'a', nombre: 'Ensalada de pétalos y cítricos', desc: 'Caléndula, naranja y hojas verdes', precio: 6800, puntos: 40 },
  { id: 'b', nombre: 'Ravioles de flor de zapallo',     desc: 'Manteca de salvia y almendras',     precio: 9200, puntos: 60 },
  { id: 'c', nombre: 'Tarta de flores comestibles',     desc: 'Pensamientos y borraja',            precio: 5400, puntos: 35 },
  { id: 'd', nombre: 'Infusión de jazmín y rosa',       desc: 'Servida en tetera de barro',        precio: 3200, puntos: 20 },
  { id: 'e', nombre: 'Milanesa de la casa',             desc: 'Con papas rústicas',                precio: 7900, puntos: 0  },
  { id: 'f', nombre: 'Café de especialidad',            desc: 'Tostado de la semana',              precio: 2600, puntos: 0  },
  { id: 'z', nombre: 'Flor de cerámica para pintar',    desc: 'Experiencia de taller: pintás tu flor y te llevás una galletita. No se combina con comida.', precio: 4500, puntos: 25, ceramica: true }
];

const MISIONES = {
  semilla:     [{ id:'m1', txt:'Pedí tu primer plato con flores', meta:'Recompensa: 5% off', req:1 }],
  capullo:     [{ id:'m2', txt:'Sumá 3 platos florales en el mes', meta:'Recompensa: postre gratis', req:3 }],
  floreciendo: [{ id:'m3', txt:'Probá 5 platos florales distintos', meta:'Recompensa: 15% off', req:5 }],
  flor:        [{ id:'m4', txt:'Traé un invitado y pedí 6 platos florales', meta:'Recompensa: menú degustación', req:6 }]
};

/* insumos y costos (vista admin) */
const STOCK_BASE = [
  { id:'petalos',  nombre:'Pétalos comestibles', un:'g',  stock:420, min:300, pedido:false },
  { id:'harina',   nombre:'Harina 0000',         un:'kg', stock:8,   min:10,  pedido:false },
  { id:'jazmin',   nombre:'Jazmín seco',         un:'g',  stock:150, min:200, pedido:false },
  { id:'cafe',     nombre:'Café de especialidad',un:'kg', stock:4,   min:3,   pedido:false },
  { id:'ceramica', nombre:'Flores de cerámica',  un:'u',  stock:12,  min:6,   pedido:false }
];
/* costo de elaboración por tanda y unidades obtenidas */
const COSTOS_BASE = MENU.map(d => ({
  id: d.id,
  costoTanda: Math.round(d.precio * 3.4),
  unidades: 10,
  precio: d.precio
}));

const defaults = () => ({
  mesas: Array.from({ length: 8 }, (_, i) => ({ n: i + 1, cap: i % 3 === 0 ? 2 : 4, ocupada: [1,4].includes(i), reservada: null, avisada: false })),
  pedidos: [],          // {id, mesa, item, estado:'cocina'|'listo'|'entregado'}
  cuenta: {},           // mesa -> items pendientes de facturar
  codigos: [],          // {codigo, puntos, usado}
  puntos: 0,
  floralesPedidos: 0,
  diasSinVenir: 0,
  ceramica: false,
  stock: JSON.parse(JSON.stringify(STOCK_BASE)),
  costos: JSON.parse(JSON.stringify(COSTOS_BASE)),
  ventas: []            // {item, total}
});

let db = JSON.parse(localStorage.getItem(STORE)) || defaults();
db.mesas.forEach(m => {
  if (typeof m.reservada === 'number') m.reservada = { personas: m.reservada, hora: null };
  if (m.reservada === undefined) m.reservada = null;
  if (m.avisada === undefined) m.avisada = false;
});
if (!db.stock)  db.stock  = JSON.parse(JSON.stringify(STOCK_BASE));
if (!db.costos) db.costos = JSON.parse(JSON.stringify(COSTOS_BASE));
if (!db.ventas) db.ventas = [];

const save = () => localStorage.setItem(STORE, JSON.stringify(db));

const dish = id => MENU.find(m => m.id === id);
const money = n => '$' + n.toLocaleString('es-AR');

function rangoActual() {
  let r = RANGOS[0];
  for (const x of RANGOS) if (db.puntos >= x.min) r = x;
  const bajas = Math.floor(db.diasSinVenir / 30);
  let i = Math.max(0, RANGOS.indexOf(r) - bajas);
  return RANGOS[i];
}

/* ---------- reloj Buenos Aires ---------- */
const TZ = 'America/Argentina/Buenos_Aires';
const fmtHora = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fmtFecha = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });

function minutosAhora() {
  const p = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [h, m] = p.split(':').map(Number);
  return h * 60 + m;
}

function tickClock() {
  document.getElementById('clock-time').textContent = fmtHora.format(new Date());
  document.getElementById('clock-date').textContent = fmtFecha.format(new Date()) + ' · Bs As';
}

/* minutos que faltan para la reserva (puede ser negativo) */
function minutosParaReserva(mesa) {
  if (!mesa.reservada || !mesa.reservada.hora) return null;
  const [h, m] = mesa.reservada.hora.split(':').map(Number);
  return (h * 60 + m) - minutosAhora();
}
function necesitaLiberarse(mesa) {
  const min = minutosParaReserva(mesa);
  return mesa.ocupada && min !== null && min <= 60;
}

/* ---------- navegación por usuario ---------- */
const ROLES = {
  recepcion: { label: 'Recepción', view: 'recepcion' },
  menu:      { label: 'Menú',      view: 'menu' },
  cocina:    { label: 'Cocina',    view: 'cocina' },
  mozo1:     { label: 'Mozo 1',    view: 'mozo', mesas: [1,2,3,4] },
  mozo2:     { label: 'Mozo 2',    view: 'mozo', mesas: [5,6,7,8] },
  app:       { label: 'App virtual', view: 'app' },
  admin:     { label: 'Admin',     view: 'admin' }
};
let rolActual = localStorage.getItem(STORE + '_rol') || 'recepcion';

const userbox = document.getElementById('userbox');
document.getElementById('user-btn').addEventListener('click', e => {
  e.stopPropagation();
  userbox.classList.toggle('open');
  document.getElementById('user-btn').setAttribute('aria-expanded', userbox.classList.contains('open'));
});
document.addEventListener('click', () => userbox.classList.remove('open'));

function setRol(rol) {
  rolActual = ROLES[rol] ? rol : 'recepcion';
  localStorage.setItem(STORE + '_rol', rolActual);
  const r = ROLES[rolActual];
  document.getElementById('user-name').textContent = r.label;
  document.getElementById('user-avatar').textContent = r.label[0].toUpperCase();
  document.querySelectorAll('.user-item[data-view]').forEach(b =>
    b.classList.toggle('is-active', b.dataset.view === rolActual));
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('is-active', v.id === 'view-' + r.view));
  if (r.view === 'mozo') {
    document.getElementById('mozo-role').textContent = r.label.toLowerCase();
    document.getElementById('mozo-desc').textContent =
      `Atendés las mesas ${r.mesas.join(', ')}. Retirá de cocina y confirmá la entrega.`;
  }
  renderKDS();
  if (rolActual === 'admin') renderAdmin();
}

document.getElementById('user-menu').addEventListener('click', e => {
  const b = e.target.closest('.user-item[data-view]'); if (!b) return;
  setRol(b.dataset.view);
  userbox.classList.remove('open');
});


function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- resetear datos (temporal) ---------- */
document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('¿Borrar todos los datos y empezar de cero?')) return;
  localStorage.removeItem(STORE);
  location.reload();
});

/* ---------- recepción ---------- */
function renderMesas() {
  const g = document.getElementById('table-grid');
  g.innerHTML = '';
  db.mesas.forEach(m => {
    const alerta = necesitaLiberarse(m);
    const el = document.createElement('button');
    el.className = 'mesa ' + (m.ocupada ? 'ocupada' : m.reservada ? 'reservada' : 'libre') + (alerta ? ' alerta' : '');
    const res = m.reservada;
    el.innerHTML = `
      ${res ? `<span class="tag-res">🌻 Reserva hecha${res.hora ? ' · ' + res.hora : ''}</span>` : ''}
      ${alerta ? `<span class="tag-alerta">⚠ Liberar mesa</span>` : ''}
      <span class="icon">${m.ocupada ? '🌺' : res ? '🌻' : '🌱'}</span>
      <h3>Mesa ${m.n}</h3>
      <span class="state">${m.ocupada ? 'Ocupada' : res ? 'Reservada' : 'Libre'}</span>
      <span class="small muted">${res ? `Reserva para ${res.personas} · ` : ''}${m.cap} sillas</span>`;
    el.onclick = () => {
      if (m.ocupada) {
        m.ocupada = false;
        m.avisada = false;
        delete db.cuenta[m.n];
        toast(`Mesa ${m.n} liberada 🌱`);
      } else if (m.reservada) {
        m.ocupada = true;
        toast(`Llegó la reserva: mesa ${m.n} para ${m.reservada.personas} personas 🌻→🌺`);
        m.reservada = null;
        m.avisada = false;
      } else {
        m.ocupada = true;
        toast(`Mesa ${m.n} asignada 🌺`);
      }
      save(); renderMesas(); renderMesaSelect(); renderReservaForm();
    };
    g.appendChild(el);
  });
}

/* revisa alertas de reservas próximas */
function chequearAlertas() {
  let cambio = false;
  db.mesas.forEach(m => {
    if (necesitaLiberarse(m)) {
      if (!m.avisada) {
        m.avisada = true; cambio = true;
        toast(`⚠ Mesa ${m.n}: reserva a las ${m.reservada.hora}. Hay que liberarla.`);
      }
    } else if (m.avisada) { m.avisada = false; cambio = true; }
  });
  if (cambio) save();
  renderMesas();
}

/* ---------- reservas ---------- */
function renderReservaForm() {
  const s = document.getElementById('res-mesa');
  const prev = s.value;
  const disp = db.mesas.filter(m => !m.reservada);
  s.innerHTML = disp.length
    ? disp.map(m => `<option value="${m.n}">Mesa ${m.n} (${m.cap} sillas)${m.ocupada ? ' · ocupada ahora' : ''}</option>`).join('')
    : '<option value="">Todas las mesas ya están reservadas</option>';
  if (prev && disp.some(m => String(m.n) === prev)) s.value = prev;
  updateSillasNote();
}

function updateSillasNote() {
  const mesa = db.mesas.find(m => String(m.n) === document.getElementById('res-mesa').value);
  const personas = Number(document.getElementById('res-personas').value) || 0;
  const nota = document.getElementById('res-nota');
  if (!mesa || !personas) { nota.textContent = ''; return; }
  const extra = personas - mesa.cap;
  nota.textContent = extra > 0
    ? `💡 Comentario: hay que agregar ${extra} silla${extra > 1 ? 's' : ''} a la mesa ${mesa.n}.`
    : `La mesa ${mesa.n} tiene ${mesa.cap} sillas: alcanza sin agregar.`;
}

document.getElementById('res-mesa').addEventListener('change', updateSillasNote);
document.getElementById('res-personas').addEventListener('input', updateSillasNote);

document.getElementById('reserva-form').addEventListener('submit', e => {
  e.preventDefault();
  const mesa = db.mesas.find(m => String(m.n) === document.getElementById('res-mesa').value);
  const personas = Number(document.getElementById('res-personas').value) || 0;
  const hora = document.getElementById('res-hora').value || null;
  if (!mesa) { toast('No hay mesas disponibles para reservar'); return; }
  if (personas < 1) { toast('Indicá la cantidad de personas'); return; }
  mesa.reservada = { personas, hora };
  mesa.avisada = false;
  save(); renderReservaForm(); chequearAlertas();
  const extra = personas - mesa.cap;
  toast(`Mesa ${mesa.n} reservada para ${personas}${hora ? ' a las ' + hora : ''} 🌻${extra > 0 ? ` · agregar ${extra} silla${extra > 1 ? 's' : ''}` : ''}`);
});

/* ---------- menú ---------- */
function renderMesaSelect() {
  const s = document.getElementById('menu-mesa');
  const prev = s.value;
  s.innerHTML = db.mesas.map(m => `<option value="${m.n}">Mesa ${m.n}${m.ocupada ? '' : m.reservada ? ' (reservada)' : ' (libre)'}</option>`).join('');
  if (prev) s.value = prev;
}

function renderMenu() {
  const r = rangoActual();
  document.getElementById('menu-rango').textContent = `${r.icono} ${r.nombre} · ${r.desc}% off`;
  const mesa = Number(document.getElementById('menu-mesa').value);
  const items = db.cuenta[mesa] || [];
  const hayCeramica = items.includes('z');
  const hayComida = items.some(id => id !== 'z');

  const list = document.getElementById('menu-list');
  list.innerHTML = '';
  MENU.forEach(d => {
    const bloqueado = d.ceramica ? hayComida : hayCeramica;
    const el = document.createElement('div');
    el.className = 'dish' + (d.ceramica ? ' dish-ceramica' : '') + (bloqueado ? ' is-blocked' : '');
    el.innerHTML = `
      <div class="dish-info">
        <h4>${d.nombre}${d.puntos ? `<span class="points-tag">+${d.puntos} pts</span>` : ''}</h4>
        <p>${d.desc}</p>
        ${bloqueado ? `<p class="block-note">${d.ceramica ? 'No se puede pedir junto con comida.' : 'La mesa pidió la flor de cerámica: es una u otra.'}</p>` : ''}
      </div>
      <span class="price">${money(d.precio)}</span>
      <button class="flor-btn ${d.ceramica ? 'ceramica' : d.puntos ? '' : 'plain'}" ${bloqueado ? 'disabled' : ''} title="Confirmar pedido">
        <span>${d.ceramica ? '🏺' : d.puntos ? '🌸' : '🍃'}</span>
      </button>`;
    el.querySelector('.flor-btn').onclick = () => pedir(d);
    list.appendChild(el);
  });
  renderTicket();
}

function pedir(d) {
  const mesa = Number(document.getElementById('menu-mesa').value);
  const m = db.mesas.find(x => x.n === mesa);
  if (!m.ocupada) { toast('Primero asigná la mesa en recepción'); return; }
  const items = db.cuenta[mesa] || [];
  if (d.ceramica && items.some(id => id !== 'z')) { toast('La flor de cerámica no se pide junto con comida'); return; }
  if (!d.ceramica && items.includes('z')) { toast('Esta mesa eligió la flor de cerámica: es una u otra'); return; }
  db.cuenta[mesa] = items;
  items.push(d.id);
  if (!d.ceramica) db.pedidos.push({ id: Date.now() + Math.random(), mesa, item: d.id, estado: 'cocina' });
  save(); renderMenu(); renderKDS();
  toast(d.ceramica ? `Flor de cerámica reservada · Mesa ${mesa} 🏺` : `${d.nombre} enviado a cocina · Mesa ${mesa}`);
}

function quitarItem(mesa, idx) {
  const items = db.cuenta[mesa] || [];
  const id = items[idx];
  items.splice(idx, 1);
  if (!items.length) delete db.cuenta[mesa];
  const p = db.pedidos.find(p => p.mesa === mesa && p.item === id && p.estado !== 'entregado');
  if (p) db.pedidos.splice(db.pedidos.indexOf(p), 1);
  save(); renderMenu(); renderKDS();
  toast('Ítem eliminado del pedido');
}

function renderTicket() {
  const mesa = Number(document.getElementById('menu-mesa').value);
  const items = db.cuenta[mesa] || [];
  const t = document.getElementById('ticket');
  if (!items.length) { t.innerHTML = `<p class="empty">Sin consumos en la mesa ${mesa || '—'}.</p>`; return; }

  const r = rangoActual();
  const sub = items.reduce((a, id) => a + dish(id).precio, 0);
  const desc = Math.round(sub * r.desc / 100);
  const pts = items.reduce((a, id) => a + dish(id).puntos, 0);

  t.innerHTML = `
    <h3>Cuenta · Mesa ${mesa}</h3>
    <ul>${items.map((id, i) => `<li>
        <span>${dish(id).nombre}</span>
        <span class="li-right">${money(dish(id).precio)}
          <button class="del" data-i="${i}" title="Eliminar ítem" aria-label="Eliminar ítem">✕</button>
        </span></li>`).join('')}</ul>
    <div class="disc"><span>Descuento ${r.nombre} (${r.desc}%)</span><span>-${money(desc)}</span></div>
    <div class="total"><span>Total</span><span>${money(sub - desc)}</span></div>
    <div class="row">
      <button class="btn" id="pagar">Pedir la cuenta y pagar</button>
      ${pts ? `<span class="pill">Suma ${pts} pts</span>` : ''}
    </div>`;
  t.querySelectorAll('.del').forEach(b => b.onclick = () => quitarItem(mesa, Number(b.dataset.i)));
  document.getElementById('pagar').onclick = () => pagar(mesa, pts, items.includes('z'));
}

function pagar(mesa, pts, tuvoCeramica) {
  if (pts > 0) {
    const codigo = 'FLOR-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    db.codigos.push({ codigo, puntos: pts, usado: false });
    document.getElementById('ticket').insertAdjacentHTML('beforeend',
      `<div class="code-box">Tu código para la app<strong>${codigo}</strong></div>`);
  }
  if (tuvoCeramica) db.ceramica = true;
  (db.cuenta[mesa] || []).forEach(id => db.ventas.push({ item: id, total: dish(id).precio }));
  delete db.cuenta[mesa];
  const m = db.mesas.find(x => x.n === mesa); if (m) { m.ocupada = false; m.avisada = false; }
  db.diasSinVenir = 0;
  save(); renderMesas(); renderCodigos(); renderMisiones(); renderKDS(); renderAdmin();
  toast(tuvoCeramica ? 'Pago registrado · misión de cerámica desbloqueada 🏺' : 'Pago registrado 🌿');

}

/* ---------- cocina (chef) y mozo ---------- */
function comandasPorMesa(filtro) {
  const porMesa = {};
  db.pedidos.filter(filtro).forEach(p => (porMesa[p.mesa] = porMesa[p.mesa] || []).push(p));
  return porMesa;
}

function renderKDS() {
  /* chef: lo que está en cocina */
  const chef = document.getElementById('kds-chef');
  const enCocina = comandasPorMesa(p => p.estado === 'cocina');
  const listas = comandasPorMesa(p => p.estado === 'listo');

  chef.innerHTML = '';
  const mesasChef = Object.keys(enCocina);
  if (!mesasChef.length) chef.innerHTML = `<p class="empty">No hay comandas en cocina.</p>`;
  mesasChef.forEach(mesa => {
    const ps = enCocina[mesa];
    const el = document.createElement('div');
    el.className = 'comanda';
    el.innerHTML = `
      <span class="status">En preparación</span>
      <h4>Mesa ${mesa}</h4>
      <ul>${ps.map(p => `<li>· ${dish(p.item).nombre}</li>`).join('')}</ul>
      <div class="row"><button class="btn ghost">Marcar listo</button></div>`;
    el.querySelector('button').onclick = () => {
      ps.forEach(p => p.estado = 'listo');
      save(); renderKDS(); toast(`Mesa ${mesa}: pedido listo para retirar`);
    };
    chef.appendChild(el);
  });

  /* mozo: lo que hay que retirar y entregar (solo sus mesas) */
  const mozo = document.getElementById('kds-mozo');
  const misMesas = (ROLES[rolActual] && ROLES[rolActual].mesas) || [1,2,3,4,5,6,7,8];
  const mias = n => misMesas.includes(Number(n));
  mozo.innerHTML = '';
  const mesasListas = Object.keys(listas).filter(mias);
  const mesasEsperando = mesasChef.filter(mias);
  if (!mesasListas.length && !mesasEsperando.length)
    mozo.innerHTML = `<p class="empty">No hay pedidos para tus mesas (${misMesas.join(', ')}).</p>`;
  mesasListas.forEach(mesa => {
    const ps = listas[mesa];
    const el = document.createElement('div');
    el.className = 'comanda listo';
    el.innerHTML = `
      <span class="status">Listo para retirar</span>
      <h4>Mesa ${mesa}</h4>
      <ul>${ps.map(p => `<li>· ${dish(p.item).nombre}</li>`).join('')}</ul>
      <div class="row"><button class="btn">Entregado en mesa</button></div>`;
    el.querySelector('button').onclick = () => {
      ps.forEach(p => p.estado = 'entregado');
      save(); renderKDS(); toast(`Mesa ${mesa}: entregado por el mozo`);
    };
    mozo.appendChild(el);
  });
  mesasEsperando.forEach(mesa => {
    const ps = enCocina[mesa];
    const el = document.createElement('div');
    el.className = 'comanda esperando';
    el.innerHTML = `
      <span class="status">Cocinando…</span>
      <h4>Mesa ${mesa}</h4>
      <ul>${ps.map(p => `<li>· ${dish(p.item).nombre}</li>`).join('')}</ul>
      <p class="small muted">Esperá a que cocina lo marque listo.</p>`;
    mozo.appendChild(el);
  });

}

/* ---------- app de puntos ---------- */
function renderRango() {
  const r = rangoActual();
  const i = RANGOS.indexOf(r);
  const next = RANGOS[i + 1];
  document.getElementById('rank-flower').textContent = r.icono;
  document.getElementById('rank-name').textContent = r.nombre;
  document.getElementById('rank-desc').textContent = `${db.puntos} puntos · ${r.desc}% de descuento en comidas`;
  const from = r.min, to = next ? next.min : r.min + 1;
  const pct = next ? Math.min(100, ((db.puntos - from) / (to - from)) * 100) : 100;
  document.getElementById('rank-bar').style.width = pct + '%';
  document.getElementById('rank-next').textContent = next
    ? `Faltan ${Math.max(0, next.min - db.puntos)} pts para ${next.nombre}`
    : 'Rango máximo alcanzado';
  document.getElementById('rank-decay').textContent = db.diasSinVenir >= 30
    ? `Bajaste de rango: ${db.diasSinVenir} días sin visitarnos.`
    : '';
}

function renderCodigos() {
  const ul = document.getElementById('codes');
  const libres = db.codigos.filter(c => !c.usado);
  ul.innerHTML = libres.length
    ? libres.map(c => `<li><span>${c.codigo}</span><span>+${c.puntos} pts</span></li>`).join('')
    : `<li class="empty">Todavía no tenés códigos. Pedí la cuenta con un plato floral.</li>`;
}

document.getElementById('code-form').addEventListener('submit', e => {
  e.preventDefault();
  const inp = document.getElementById('code-input');
  const msg = document.getElementById('code-msg');
  const c = db.codigos.find(x => x.codigo === inp.value.trim().toUpperCase() && !x.usado);
  if (!c) { msg.className = 'feedback err'; msg.textContent = 'Código inválido o ya utilizado.'; return; }
  c.usado = true;
  db.puntos += c.puntos;
  db.floralesPedidos += 1;
  db.diasSinVenir = 0;
  save(); inp.value = '';
  msg.className = 'feedback ok'; msg.textContent = `¡Sumaste ${c.puntos} puntos!`;
  renderRango(); renderCodigos(); renderMisiones(); renderMenu();
});

function renderMisiones() {
  const r = rangoActual();
  const ul = document.getElementById('missions');
  const items = MISIONES[r.id].map(m => {
    const done = db.floralesPedidos >= m.req;
    return `<li class="mission ${done ? 'done' : ''}">
      <strong>${done ? '✓ ' : ''}${m.txt}</strong>
      <span>${m.meta} · ${Math.min(db.floralesPedidos, m.req)}/${m.req}</span></li>`;
  });
  items.push(`<li class="mission ${db.ceramica ? '' : 'locked'}">
    <strong>🏺 Misión extra: flor de cerámica</strong>
    <span>${db.ceramica
      ? 'Pintá tu flor y llevate una galletita de regalo.'
      : 'Se desbloquea al pedir la experiencia de la flor de cerámica en el menú.'}</span></li>`);
  ul.innerHTML = items.join('');
}

/* simulación de inactividad (demo del descenso de rango) */
function addDecayControl() {
  const card = document.querySelector('.rank-card');
  const b = document.createElement('button');
  b.className = 'btn ghost'; b.style.marginTop = '12px';
  b.textContent = 'Simular 30 días sin visitar';
  b.onclick = () => { db.diasSinVenir += 30; save(); renderRango(); renderMisiones(); renderMenu(); toast('Pasaron 30 días…'); };
  card.appendChild(b);
}

/* ---------- admin ---------- */
/* aplica precios editados a la carta */
db.costos.forEach(c => { const d = dish(c.id); if (d && c.precio) d.precio = c.precio; });

function renderAdmin() {
  if (!document.getElementById('view-admin').classList.contains('is-active')) return;
  renderAdminFlujo(); renderAdminStock(); renderAdminCostos();
}

function renderAdminFlujo() {
  const cont = document.getElementById('admin-flujo');
  const activas = db.mesas.filter(m => m.ocupada || (db.cuenta[m.n] || []).length);
  cont.innerHTML = '';
  if (!activas.length) { cont.innerHTML = `<p class="empty">No hay mesas en circuito ahora.</p>`; return; }
  activas.forEach(m => {
    const items = db.cuenta[m.n] || [];
    const ped = db.pedidos.filter(p => p.mesa === m.n);
    const pasos = [
      ['Recibir cliente',   m.ocupada],
      ['Tomar pedido',      items.length > 0],
      ['Elaborar pedido',   ped.length > 0 && ped.every(p => p.estado !== 'cocina')],
      ['Entregar pedido',   ped.length > 0 && ped.every(p => p.estado === 'entregado')],
      ['Cobrar cuenta / dar cuenta', false],
      ['Limpiar mesa',      false]
    ];
    const el = document.createElement('div');
    el.className = 'flow-card';
    el.innerHTML = `<h4>Mesa ${m.n}</h4>
      <ul>${pasos.map(([t, ok]) => `<li class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${t}</li>`).join('')}</ul>
      <p class="small muted" style="margin-top:8px">Se repite el circuito si el cliente pide más.</p>`;
    cont.appendChild(el);
  });
}

function renderAdminStock() {
  const t = document.getElementById('admin-stock');
  t.innerHTML = `<thead><tr><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Estado</th><th>Acción</th></tr></thead>
    <tbody>${db.stock.map((s, i) => {
      const falta = s.stock < s.min;
      return `<tr>
        <td>${s.nombre}</td>
        <td>${s.stock} ${s.un}</td>
        <td>${s.min} ${s.un}</td>
        <td class="${falta ? 'falta' : 'ok-txt'}">${falta ? (s.pedido ? 'Pedido al proveedor' : 'Faltante') : 'OK'}</td>
        <td>${falta
            ? (s.pedido
                ? `<button class="btn" data-recibir="${i}">Recibir mercadería</button>`
                : `<button class="btn ghost" data-pedir="${i}">Pedir al proveedor</button>`)
            : '<span class="muted small">—</span>'}</td>
      </tr>`;
    }).join('')}</tbody>`;
  t.querySelectorAll('[data-pedir]').forEach(b => b.onclick = () => {
    const s = db.stock[b.dataset.pedir]; s.pedido = true;
    save(); renderAdminStock(); toast(`Pedido enviado al proveedor: ${s.nombre}`);
  });
  t.querySelectorAll('[data-recibir]').forEach(b => b.onclick = () => {
    const s = db.stock[b.dataset.recibir];
    s.stock = s.min * 2; s.pedido = false;
    save(); renderAdminStock(); toast(`Mercadería recibida y stock actualizado: ${s.nombre}`);
  });
}

function renderAdminCostos() {
  const t = document.getElementById('admin-costos');
  t.innerHTML = `<thead><tr><th>Producto</th><th>Costo tanda</th><th>Unidades</th><th>Costo unit.</th><th>Precio venta</th><th>Ganancia</th><th></th></tr></thead>
    <tbody>${db.costos.map((c, i) => {
      const unit = Math.round(c.costoTanda / c.unidades);
      const gan = c.precio - unit;
      const margen = Math.round((gan / c.precio) * 100);
      return `<tr>
        <td>${dish(c.id).nombre}</td>
        <td>${money(c.costoTanda)}</td>
        <td>${c.unidades}</td>
        <td>${money(unit)}</td>
        <td><input type="number" min="0" step="100" value="${c.precio}" data-precio="${i}" /></td>
        <td class="${gan > 0 ? 'ok-txt' : 'falta'}">${money(gan)} · ${margen}%</td>
        <td>${margen < 40 ? `<button class="btn ghost" data-ajustar="${i}">Ajustar precio</button>` : '<span class="muted small">OK</span>'}</td>
      </tr>`;
    }).join('')}</tbody>`;
  t.querySelectorAll('[data-precio]').forEach(inp => inp.onchange = () => {
    const c = db.costos[inp.dataset.precio];
    c.precio = Number(inp.value) || c.precio;
    dish(c.id).precio = c.precio;
    save(); renderAdminCostos(); renderMenu(); toast('Precio de venta actualizado');
  });
  t.querySelectorAll('[data-ajustar]').forEach(b => b.onclick = () => {
    const c = db.costos[b.dataset.ajustar];
    const unit = c.costoTanda / c.unidades;
    c.precio = Math.round((unit / 0.5) / 100) * 100;
    dish(c.id).precio = c.precio;
    save(); renderAdminCostos(); renderMenu(); toast('Precio ajustado a 50% de margen');
  });

  const ingreso = db.ventas.reduce((a, v) => a + v.total, 0);
  const costo = db.ventas.reduce((a, v) => {
    const c = db.costos.find(x => x.id === v.item);
    return a + (c ? c.costoTanda / c.unidades : 0);
  }, 0);
  document.getElementById('admin-totales').innerHTML = `
    <span>Ventas cobradas: ${money(ingreso)}</span>
    <span>Costo de lo vendido: ${money(Math.round(costo))}</span>
    <span class="${ingreso - costo >= 0 ? 'ok-txt' : 'falta'}">Ganancia: ${money(Math.round(ingreso - costo))}</span>`;
}

/* ---------- init ---------- */
document.getElementById('menu-mesa').addEventListener('change', renderMenu);
renderMesas(); renderMesaSelect(); renderReservaForm(); renderMenu(); renderKDS();
renderRango(); renderCodigos(); renderMisiones(); addDecayControl();
setRol(rolActual);

tickClock(); setInterval(tickClock, 1000);
chequearAlertas(); setInterval(chequearAlertas, 20000);
