const supabaseUrl = "https://pkmymaxxbqacotuxiftk.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbXltYXh4YnFhY290dXhpZnRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzM1NTMsImV4cCI6MjEwMjEwOTU1M30.PBdkVqsOwJu6esrWrn0_GaYfTi2vrASMPKSnAMZzPvs";
var supabase = window.__paddleSupabaseClient || (window.supabase ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null);
if (supabase && !window.__paddleSupabaseClient) {
  window.__paddleSupabaseClient = supabase;
}

const STORAGE_KEY = 'paddle_chill_bookings';
const ADMIN_KEY = 'paddle_chill_admin';
const ADMIN_TOKEN_KEY = 'paddle_chill_admin_token';
const BOOKINGS_TABLE = 'bookings';
let adminRealtimeChannel = null;

function setupAdminRealtime(){
  if(!supabase || !supabase.channel || adminRealtimeChannel) return;
  adminRealtimeChannel = supabase.channel('paddle_chill_admin_bookings_live');
  adminRealtimeChannel.on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: BOOKINGS_TABLE
  }, async () => {
    try {
      await syncSupabaseBookings();
      if (typeof renderAdminTable === 'function') renderAdminTable();
    } catch (e) {
      console.warn('Admin booking sync failed:', e);
    }
  }).subscribe();
}

function normalizeBookingRow(row) {
  return {
    id: row.id,
    name: row.customer_name || '',
    phone: row.phone || '',
    court: row.court,
    date: row.booking_date,
    time: row.time || '',
    payment: row.payment_method || 'Cash on arrival',
    amount: Number(row.amount || 0),
    status: row.status || 'Pending',
    paymentProof: row.payment_proof_url || '',
    paymentProofName: row.payment_proof_name || '',
    hourStart: row.start_hour,
    hourEnd: row.end_hour,
    duration: row.duration
  };
}

function getBookings(){
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveBookings(list){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

async function syncSupabaseBookings(){
  if(!supabase) return [];
  const { data, error } = await supabase.from(BOOKINGS_TABLE).select('*').order('created_at', { ascending: false });
  if(error){
    console.error('Supabase fetch error:', error);
    return getBookings();
  }

  const normalized = (data || []).map(normalizeBookingRow);
  saveBookings(normalized);
  return normalized;
}

function formatCurrency(value){
  return `₱${Number(value || 0).toLocaleString()}`;
}

function formatDateNice(iso){
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function isAdminAuthenticated(){
  return localStorage.getItem(ADMIN_KEY) === 'true';
}

function setAdminAuthenticated(value){
  localStorage.setItem(ADMIN_KEY, value ? 'true' : 'false');
}

function getAdminToken(){
  return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function setAdminToken(token){
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

function showAdminError(message){
  const el = document.getElementById('adminError');
  if (!el) return;
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function renderStats(bookings){
  document.getElementById('statTotal').textContent = bookings.length;
  document.getElementById('statConfirmed').textContent = bookings.filter(b => b.status === 'Confirmed').length;
  document.getElementById('statPending').textContent = bookings.filter(b => b.status === 'Pending').length;
}

function renderAdminTable(){
  const searchTerm = (document.getElementById('adminSearch')?.value || '').toLowerCase();
  const tbody = document.getElementById('adminTableBody');
  const bookings = getBookings().slice().sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  const filtered = bookings.filter((b) => {
    const haystack = `${b.name} ${b.phone} ${b.court} ${b.date} ${b.time} ${b.payment}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding:28px; color:var(--ink-soft);">No bookings found.</td>
      </tr>
    `;
    renderStats(bookings);
    return;
  }

  tbody.innerHTML = filtered.map((b, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${b.name}</td>
      <td>${b.phone}</td>
      <td>${b.court}</td>
      <td>${formatDateNice(b.date)}</td>
      <td>${b.time}</td>
      <td>${b.payment}</td>
      <td>
        ${b.paymentProof ? `<img class="proof-thumb" src="${b.paymentProof}" alt="${b.paymentProofName || 'Payment proof'}" data-role="view-proof" data-proof="${encodeURIComponent(b.paymentProof)}" />` : `<span class="proof-empty">—</span>`}
      </td>
      <td>${formatCurrency(b.amount)}</td>
      <td><span class="status-pill ${b.status === 'Confirmed' ? 'status-confirmed' : 'status-pending'}">${b.status}</span></td>
      <td>
        <div class="admin-actions-cell">
          <button class="admin-table-action" type="button" data-role="toggle-status" data-id="${b.id}">
            ${b.status === 'Confirmed' ? 'Mark pending' : 'Mark confirmed'}
          </button>
          <button class="admin-remove-btn" type="button" data-role="remove-booking" data-id="${b.id}">Remove</button>
        </div>
      </td>
    </tr>
  `).join('');

  renderStats(bookings);

  tbody.querySelectorAll('[data-role="view-proof"]').forEach(img => {
    img.addEventListener('click', () => {
      const lightbox = document.getElementById('proofLightbox');
      const image = document.getElementById('proofLightboxImage');
      if (!lightbox || !image) return;
      image.src = decodeURIComponent(img.dataset.proof || '');
      lightbox.classList.add('show');
      lightbox.setAttribute('aria-hidden', 'false');
    });
  });

  tbody.querySelectorAll('[data-role="toggle-status"]').forEach(button => {
    button.addEventListener('click', async () => {
      const booking = getBookings().find(item => item.id === button.dataset.id);
      if (!booking) return;
      const nextStatus = booking.status === 'Confirmed' ? 'Pending' : 'Confirmed';

      const response = await fetch('/api/admin-update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: booking.id, status: nextStatus, token: getAdminToken() })
      });
      const result = await response.json().catch(() => ({ ok: false }));

      if (!response.ok || !result.ok) {
        if (response.status === 401) {
          logoutAdmin();
        }
        console.error('Admin update error:', result.message);
        return;
      }

      booking.status = nextStatus;
      saveBookings(getBookings().map(item => item.id === booking.id ? booking : item));
      await syncSupabaseBookings();
      renderAdminTable();
    });
  });

  tbody.querySelectorAll('[data-role="remove-booking"]').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      if (!id) return;
      if (confirm('Remove this booking?')) {
        const response = await fetch('/api/admin-delete-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, token: getAdminToken() })
        });
        const result = await response.json().catch(() => ({ ok: false }));

        if (!response.ok || !result.ok) {
          if (response.status === 401) {
            logoutAdmin();
          }
          console.error('Admin delete error:', result.message);
          return;
        }

        const saved = getBookings();
        saveBookings(saved.filter(item => item.id !== id));

        const refreshed = await syncSupabaseBookings();
        if (refreshed && Array.isArray(refreshed)) {
          saveBookings(refreshed.filter(item => item.id !== id));
        }

        renderAdminTable();
      }
    });
  });
}

function showAdminPanel(){
  document.getElementById('loginScreen').classList.add('admin-hidden');
  document.getElementById('adminScreen').classList.remove('admin-hidden');
  renderAdminTable();
}

function showLoginPanel(){
  document.getElementById('loginScreen').classList.remove('admin-hidden');
  document.getElementById('adminScreen').classList.add('admin-hidden');
  showAdminError('');
}

async function loginAdmin(event){
  event.preventDefault();
  const input = document.getElementById('adminPassword');
  const value = (input.value || '').trim();

  if (!value) {
    setAdminAuthenticated(false);
    showAdminError('Please enter the admin password.');
    return;
  }

  try {
    const response = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: value })
    });
    const result = await response.json().catch(() => ({ ok: false, message: 'Admin login is unavailable right now.' }));

    if (!response.ok || !result.ok) {
      setAdminAuthenticated(false);
      setAdminToken('');
      showAdminError(result.message || 'Incorrect admin password.');
      return;
    }

    setAdminAuthenticated(true);
    setAdminToken(result.token || '');
    showAdminError('');
    showAdminPanel();
    input.value = '';
  } catch (error) {
    console.error('Admin login request failed:', error);
    setAdminAuthenticated(false);
    setAdminToken('');
    showAdminError('Admin login service is not available yet. Deploy on Vercel and set ADMIN_PASSWORD in the project environment.');
  }
}

function logoutAdmin(){
  setAdminAuthenticated(false);
  setAdminToken('');
  showLoginPanel();
}

function initAdmin(){
  const loginForm = document.getElementById('loginForm');
  const logoutBtn = document.getElementById('logoutBtn');
  const searchInput = document.getElementById('adminSearch');
  const refreshBtn = document.getElementById('refreshBookings');
  const closeBtn = document.getElementById('closeProofLightbox');
  const lightbox = document.getElementById('proofLightbox');

  if (loginForm) {
    loginForm.addEventListener('submit', loginAdmin);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutAdmin);
  }

  if (searchInput) {
    searchInput.addEventListener('input', renderAdminTable);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      await syncSupabaseBookings();
      renderAdminTable();
      refreshBtn.disabled = false;
    });
  }

  if (closeBtn && lightbox) {
    closeBtn.addEventListener('click', () => {
      lightbox.classList.remove('show');
      lightbox.setAttribute('aria-hidden', 'true');
    });
    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) {
        lightbox.classList.remove('show');
        lightbox.setAttribute('aria-hidden', 'true');
      }
    });
  }

  if (isAdminAuthenticated()) {
    showAdminPanel();
  } else {
    showLoginPanel();
  }
}

if(typeof window !== 'undefined') {
  if(supabase) {
    setupAdminRealtime();
    syncSupabaseBookings().then(() => initAdmin());
  } else {
    initAdmin();
  }

  setInterval(async () => {
    if (!isAdminAuthenticated()) return;
    try {
      await syncSupabaseBookings();
      renderAdminTable();
    } catch (e) {
      console.warn('Admin polling sync failed:', e);
    }
  }, 6000);
} else {
  initAdmin();
}
