const supabaseUrl = "https://pkmymaxxbqacotuxiftk.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbXltYXh4YnFhY290dXhpZnRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzM1NTMsImV4cCI6MjEwMjEwOTU1M30.PBdkVqsOwJu6esrWrn0_GaYfTi2vrASMPKSnAMZzPvs";
var supabase = window.__paddleSupabaseClient || (window.supabase ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null);
if (supabase && !window.__paddleSupabaseClient) {
  window.__paddleSupabaseClient = supabase;
}

const STORAGE_KEY = 'paddle_chill_bookings';
const ADMIN_KEY = 'paddle_chill_admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const BOOKINGS_TABLE = 'bookings';

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

      if (supabase) {
        const { error } = await supabase.from(BOOKINGS_TABLE).update({ status: nextStatus }).eq('id', booking.id);
        if (error) {
          console.error('Supabase update error:', error);
          return;
        }
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
      if (confirm('Remove this booking?')) {
        if (supabase) {
          const { error } = await supabase.from(BOOKINGS_TABLE).delete().eq('id', id);
          if (error) {
            console.error('Supabase delete error:', error);
            return;
          }
        }
        saveBookings(getBookings().filter(item => item.id !== id));
        await syncSupabaseBookings();
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

function loginAdmin(event){
  event.preventDefault();
  const input = document.getElementById('adminPassword');
  const value = (input.value || '').trim();

  if (value === DEFAULT_ADMIN_PASSWORD) {
    setAdminAuthenticated(true);
    showAdminError('');
    showAdminPanel();
    input.value = '';
    return;
  }

  setAdminAuthenticated(false);
  showAdminError('Incorrect admin password.');
}

function logoutAdmin(){
  setAdminAuthenticated(false);
  showLoginPanel();
}

function initAdmin(){
  const loginForm = document.getElementById('loginForm');
  const logoutBtn = document.getElementById('logoutBtn');
  const searchInput = document.getElementById('adminSearch');
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
    console.info('Supabase client initialized; admin sync is paused until the RLS policies are corrected.');
  }
  initAdmin();
} else {
  initAdmin();
}
