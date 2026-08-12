const supabaseUrl = "https://pkmymaxxbqacotuxiftk.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbXltYXh4YnFhY290dXhpZnRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzM1NTMsImV4cCI6MjEwMjEwOTU1M30.PBdkVqsOwJu6esrWrn0_GaYfTi2vrASMPKSnAMZzPvs";
var supabase = window.__paddleSupabaseClient || (window.supabase ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null);
if (supabase && !window.__paddleSupabaseClient) {
  window.__paddleSupabaseClient = supabase;
}

const COURTS = ["Court 1", "Court 2"];
const OPEN_HOUR = 0;          // open 24 hours
const CLOSE_HOUR = 24;        // last slot starts 23:00 (ends 24:00)
const PRICE_PER_HOUR = 250;   // in PHP (₱)
const CURRENCY = "₱";
const STORAGE_KEY = "paddle_chill_bookings";
const BOOKINGS_TABLE = "bookings";

function normalizeBooking(row){
  return {
    id: row.id,
    name: row.customer_name || row.name || "",
    phone: row.phone || "",
    court: row.court,
    date: row.booking_date || row.date,
    time: row.time || "",
    hourStart: row.start_hour ?? row.hourStart,
    hourEnd: row.end_hour ?? row.hourEnd,
    duration: row.duration || 1,
    payment: row.payment_method || row.payment || "Cash on arrival",
    paymentProof: row.payment_proof_url || row.paymentProof || "",
    paymentProofName: row.payment_proof_name || row.paymentProofName || "",
    amount: Number(row.amount ?? row.total ?? 0),
    status: row.status || "Pending",
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

/* ---------- STORAGE HELPERS ---------- */
function getBookings(){
  try{
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  }catch(e){
    return [];
  }
}
function saveBookings(list){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
async function syncSupabaseBookings(){
  if(!supabase) return;
  try{
    const { data, error } = await supabase.from(BOOKINGS_TABLE).select("*").order("created_at", { ascending: false });
    if(error){
      console.error("Supabase fetch error:", error);
      return;
    }
    const normalized = (data || []).map(normalizeBooking);
    saveBookings(normalized);
    return normalized;
  }catch(e){
    console.warn("Supabase sync skipped:", e);
    return getBookings();
  }
}
async function addBooking(booking){
  const payload = {
    id: booking.id,
    customer_name: booking.name,
    phone: booking.phone,
    court: booking.court,
    booking_date: booking.date,
    time: booking.time,
    start_hour: booking.hourStart,
    end_hour: booking.hourEnd,
    duration: booking.duration,
    payment_method: booking.payment,
    payment_status: booking.paymentStatus || "pending",
    status: booking.status || "Pending",
    amount: booking.amount,
    payment_proof_url: booking.paymentProof || null,
    payment_proof_name: booking.paymentProofName || null,
    created_at: booking.createdAt || new Date().toISOString()
  };

  if(supabase){
    const { data, error } = await supabase.from(BOOKINGS_TABLE).insert([payload]).select();
    if(error){
      console.error("Supabase insert error:", error);
      throw new Error(error?.message || "Could not save booking to Supabase.");
    }
    await syncSupabaseBookings();
    return data;
  }

  const list = getBookings();
  list.push(booking);
  saveBookings(list);
  await syncSupabaseBookings();
  return [booking];
}
async function removeBooking(id){
  if(supabase){
    const { error } = await supabase.from(BOOKINGS_TABLE).delete().eq("id", id);
    if(error){
      console.error("Supabase delete error:", error);
      saveBookings(getBookings().filter(b => b.id !== id));
      return;
    }
  } else {
    saveBookings(getBookings().filter(b => b.id !== id));
  }

  await syncSupabaseBookings();
}
function isHourTaken(court, date, hour){
  return getBookings().some(b => b.court === court && b.date === date && typeof b.hourStart === 'number' && typeof b.hourEnd === 'number' && hour >= b.hourStart && hour < b.hourEnd);
}

/* ---------- UTIL ---------- */
function pad(n){ return n.toString().padStart(2,"0"); }
function toTimeLabel(hour){
  const normalized = ((hour % 24) + 24) % 24;
  const h12 = ((normalized + 11) % 12) + 1;
  const ampm = normalized < 12 ? "AM" : "PM";
  return `${h12}:00 ${ampm}`;
}
function allTimeSlots(){
  const out = [];
  for(let h = OPEN_HOUR; h < CLOSE_HOUR; h++) out.push(h);
  return out;
}
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function formatDateNice(iso){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString(undefined, { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}
function genId(){
  return "CL-" + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2,4).toUpperCase();
}
function readFileAsDataURL(file){
  return new Promise((resolve, reject) => {
    if(!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}
function showToast(msg, isError){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.toggle("error", !!isError);
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ================================================================
   NAVIGATION BETWEEN MAIN VIEWS (Book / Schedule / All Bookings)
   ================================================================ */
const navButtons = document.querySelectorAll(".nav-btn");
const views = { book: "view-book", schedule: "view-schedule", sheet: "view-sheet" };
const ADMIN_PASSWORD = "admin123";
let isAdminSession = false;

function promptAdminAccess(){
  const value = window.prompt("Enter admin password:");
  if(value === null) return false;
  if(value === ADMIN_PASSWORD){
    isAdminSession = true;
    return true;
  }
  showToast("Incorrect admin password.", true);
  return false;
}

function switchView(key){
  if(key === "sheet"){
    if(!isAdminSession && !promptAdminAccess()){
      return;
    }
  }

  navButtons.forEach(b => b.classList.toggle("active", b.dataset.view === key));
  Object.entries(views).forEach(([k, id]) => {
    document.getElementById(id).classList.toggle("active", k === key);
  });
  if(key === "schedule") {
    renderCalendar();
    const focusDate = wizardState.date || todayISO();
    showDayDetail(focusDate);
  }
  if(key === "sheet") renderSheet();
}
navButtons.forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
if(typeof window !== "undefined") {
  if(supabase) {
    syncSupabaseBookings();
  }
}

/* ================================================================
   BOOKING WIZARD
   ================================================================ */
let wizardState = {
  name: "", phone: "", court: null, date: null, time: null, hour: null, payMethod: "Cash on arrival",
  selectedHours: []
};

function goToStep(n){
  document.querySelectorAll(".step-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`step-${n}`).classList.add("active");
  document.querySelectorAll(".step-item").forEach(item => {
    const s = Number(item.dataset.step);
    item.classList.toggle("active", s === n);
    item.classList.toggle("done", s < n);
  });
}

/* --- Step 1: details --- */
function validateUserDetails(){
  const name = document.getElementById("inputName").value.trim();
  const phone = document.getElementById("inputPhone").value.trim();
  const nameOk = name.length > 0 && /^[A-Za-zÀ-ÖØ-öø-ÿ'\-.\s]+$/.test(name);
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneOk = phone.length > 0 && /^[0-9\s\-\+]+$/.test(phone) && phoneDigits.length >= 7;

  if(!name){
    errorName.textContent = "⚠ Please enter your full name.";
    inputName.classList.add('input-error');
    return { valid: false, message: "Please enter your full name." };
  }

  if(!nameOk){
    errorName.textContent = "⚠ Name should only contain letters and spaces.";
    inputName.classList.add('input-error');
    return { valid: false, message: "Name should only contain letters and spaces." };
  }

  if(!phone){
    errorPhone.textContent = "⚠ Please enter your phone number.";
    inputPhone.classList.add('input-error');
    return { valid: false, message: "Please enter your phone number." };
  }

  if(!phoneOk){
    errorPhone.textContent = "⚠ Phone number should contain only numbers, spaces, dashes, or plus signs.";
    inputPhone.classList.add('input-error');
    return { valid: false, message: "Phone number should contain only numbers, spaces, dashes, or plus signs." };
  }

  errorName.textContent = "";
  errorPhone.textContent = "";
  inputName.classList.remove('input-error');
  inputPhone.classList.remove('input-error');
  return { valid: true, name, phone };
}

document.getElementById("toStep2").addEventListener("click", () => {
  const err = document.getElementById("error-1");
  const validation = validateUserDetails();

  if(!validation.valid){
    err.textContent = validation.message;
    err.classList.add("show");
    return;
  }

  err.classList.remove("show");
  wizardState.name = validation.name;
  wizardState.phone = validation.phone;

  const dateInput = document.getElementById("inputDate");
  if(!dateInput.value) dateInput.value = todayISO();
  dateInput.min = todayISO();
  renderSlotBoard();

  goToStep(2);
});

/* --- Step 2: court, date, time --- */
document.getElementById("toStep1Back").addEventListener("click", () => goToStep(1));

document.getElementById("inputDate").addEventListener("change", () => {
  wizardState.court = null; wizardState.time = null; wizardState.hour = null; wizardState.selectedHours = [];
  updateSelectedSummary(true);
  renderSlotBoard();
});

function updateSelectedSummary(forceHide = false){
  const summary = document.getElementById("selectionSummary");
  const text = document.getElementById("selectionText");

  if(forceHide || !wizardState.court || !wizardState.selectedHours.length){
    summary.hidden = true;
    if(text) text.textContent = "";
    return;
  }

  const date = wizardState.date || document.getElementById("inputDate").value;
  const first = wizardState.selectedHours[0];
  const last = wizardState.selectedHours[wizardState.selectedHours.length - 1];
  wizardState.time = `${toTimeLabel(first)} – ${toTimeLabel(last + 1)}`;
  summary.hidden = false;
  text.textContent = `${wizardState.court} · ${formatDateNice(date)} · ${wizardState.time} (${wizardState.selectedHours.length} hr${wizardState.selectedHours.length>1 ? "s" : ""})`;
}

function clearSelectedHours(){
  wizardState.court = null;
  wizardState.time = null;
  wizardState.hour = null;
  wizardState.selectedHours = [];
  updateSelectedSummary(true);
  renderSlotBoard();
}

function renderSlotBoard(){
  const board = document.getElementById("slotBoard");
  const date = document.getElementById("inputDate").value;
  if(!date){
    board.innerHTML = `<p class="hint">Pick a date above to see the board.</p>`;
    return;
  }
  wizardState.date = date;
  let html = "";
  COURTS.forEach(court => {
    html += `<div class="slot-court-group"><div class="slot-court-title">${court}</div><div class="slot-grid">`;
    allTimeSlots().forEach(hour => {
      const time = toTimeLabel(hour);
      const taken = isHourTaken(court, date, hour);
      const selected = wizardState.court === court && wizardState.selectedHours.includes(hour);
      html += `<button type="button" class="slot-btn ${selected ? "selected" : ""}"
                 ${taken ? "disabled" : ""}
                 data-court="${court}" data-hour="${hour}" data-time="${time}">
                 ${time}${taken ? "" : ""}
               </button>`;
    });
    html += `</div></div>`;
  });
  board.innerHTML = html;

  board.querySelectorAll(".slot-btn:not(:disabled)").forEach(btn => {
    btn.addEventListener("click", () => {
      const court = btn.dataset.court;
      const hour = Number(btn.dataset.hour);

      if(!wizardState.court){
        wizardState.court = court;
      }

      if(wizardState.court !== court){
        wizardState.selectedHours = [];
        wizardState.court = court;
      }

      const idx = wizardState.selectedHours.indexOf(hour);
      if(idx === -1){
        wizardState.selectedHours.push(hour);
        wizardState.selectedHours.sort((a,b) => a-b);
      } else {
        wizardState.selectedHours.splice(idx,1);
      }

      if(!wizardState.selectedHours.length){
        clearSelectedHours();
        return;
      }

      renderSlotBoard();
      updateSelectedSummary();
    });
  });
}

function resetCourtTimeSelection(){
  wizardState.court = null;
  wizardState.time = null;
  wizardState.hour = null;
  wizardState.selectedHours = [];
  updateSelectedSummary(true);
  document.getElementById("error-2").classList.remove("show");
  renderSlotBoard();
}


document.getElementById("clearSelection").addEventListener("click", resetCourtTimeSelection);

document.getElementById("toStep3").addEventListener("click", () => {
  const err = document.getElementById("error-2");
  if(!wizardState.court || !wizardState.selectedHours.length){
    err.textContent = "Please select an available court and one or more time slots.";
    err.classList.add("show");
    return;
  }
  // Double-check availability for each selected hour
  for(const h of wizardState.selectedHours){
    if(isHourTaken(wizardState.court, wizardState.date, h)){
      err.textContent = `${wizardState.court} at ${toTimeLabel(h)} was just booked by someone else. Please choose another slot.`;
      err.classList.add("show");
      renderSlotBoard();
      return;
    }
  }
  err.classList.remove("show");
  renderOrderSummary();
  goToStep(3);
});
document.getElementById("toStep2Back").addEventListener("click", () => goToStep(2));

function renderOrderSummary(){
  const box = document.getElementById("orderSummary");
  const hours = wizardState.selectedHours.length || 0;
  const start = hours ? wizardState.selectedHours[0] : null;
  const end = hours ? (wizardState.selectedHours[wizardState.selectedHours.length-1] + 1) : null;
  const timeLabel = hours ? `${toTimeLabel(start)} – ${toTimeLabel(end)}` : "";
  const total = PRICE_PER_HOUR * hours;
  box.innerHTML = `
    <div><span>Name</span><span>${wizardState.name}</span></div>
    <div><span>Court</span><span>${wizardState.court}</span></div>
    <div><span>Date</span><span>${formatDateNice(wizardState.date)}</span></div>
    <div><span>Time</span><span>${timeLabel}</span></div>
    <div class="total"><span>Total (${hours} hr${hours>1?"s":""})</span><span>${CURRENCY}${total}</span></div>
  `;
}

/* --- Step 3: payment --- */
document.getElementById("confirmBooking").addEventListener("click", async () => {
  const method = document.querySelector('input[name="payMethod"]:checked').value;
  const err = document.getElementById("error-3");
  err.textContent = '';
  err.classList.remove('show');

  let proofFile = null;
  if(method === 'GCash'){
    proofFile = document.getElementById('proofGCash').files[0];
    if(!proofFile){
      err.textContent = '⚠ Please upload a screenshot of your GCash payment before confirming.';
      err.classList.add('show');
      return;
    }
  } else if(method === 'Bank transfer'){
    proofFile = document.getElementById('proofBank').files[0];
    if(!proofFile){
      err.textContent = '⚠ Please upload a screenshot of your bank transfer receipt before confirming.';
      err.classList.add('show');
      return;
    }
  }

  // Final availability guard for each hour
  for(const h of wizardState.selectedHours){
    if(isHourTaken(wizardState.court, wizardState.date, h)){
      err.textContent = `That slot at ${toTimeLabel(h)} was just taken. Please go back and pick another.`;
      err.classList.add("show");
      return;
    }
  }

  const hours = wizardState.selectedHours.length;
  const start = wizardState.selectedHours[0];
  const end = wizardState.selectedHours[wizardState.selectedHours.length-1] + 1;
  const timeStr = `${toTimeLabel(start)} – ${toTimeLabel(end)}`;
  const amount = PRICE_PER_HOUR * hours;

  let paymentProof = "";
  let paymentProofName = "";
  if(proofFile){
    try {
      paymentProof = await readFileAsDataURL(proofFile);
      paymentProofName = proofFile.name;
    } catch (e) {
      err.textContent = '⚠ Could not read the payment proof file. Please try again.';
      err.classList.add('show');
      return;
    }
  }

  const booking = {
    id: genId(),
    name: wizardState.name,
    phone: wizardState.phone,
    court: wizardState.court,
    date: wizardState.date,
    time: timeStr,
    hourStart: start,
    hourEnd: end,
    duration: hours,
    payment: method,
    paymentProof: paymentProof,
    paymentProofName: paymentProofName,
    amount: amount,
    status: method === "Cash on arrival" ? "Pending" : "Confirmed",
    createdAt: new Date().toISOString()
  };

  try {
    await addBooking(booking);
    renderCalendar();
    if (wizardState.date) {
      showDayDetail(wizardState.date);
    }
    if (typeof renderSheet === 'function') {
      renderSheet();
    }
    renderConfirmation(booking);
    goToStep(4);
    showToast("Booking confirmed — you're on the board!");
  } catch (submitError) {
    console.error("Booking submit failed:", submitError);
    err.textContent = submitError?.message || "Booking could not be saved. Please try again or contact the court owner.";
    err.classList.add('show');
  }
});

function renderConfirmation(b){
  document.getElementById("confirmDetails").innerHTML = `
    <div><span>Booking ref</span><span>${b.id}</span></div>
    <div><span>Name</span><span>${b.name}</span></div>
    <div><span>Court</span><span>${b.court}</span></div>
    <div><span>Date</span><span>${formatDateNice(b.date)}</span></div>
    <div><span>Time</span><span>${b.time}</span></div>
    <div><span>Payment</span><span>${b.payment}</span></div>
    <div><span>Amount</span><span>${CURRENCY}${b.amount}</span></div>
    <div><span>Status</span><span>${b.status}</span></div>
  `;
}

document.getElementById("bookAnother").addEventListener("click", () => {
  wizardState = {
    name: "",
    phone: "",
    court: null,
    date: null,
    time: null,
    hour: null,
    payMethod: "Cash on arrival",
    selectedHours: []
  };

  document.getElementById("inputName").value = "";
  document.getElementById("inputPhone").value = "";
  document.getElementById("inputDate").value = "";
  document.getElementById("selectionText").textContent = "";
  document.getElementById("selectionSummary").hidden = true;

  document.querySelectorAll('input[name="payMethod"]').forEach(r => {
    r.checked = r.value === "Cash on arrival";
  });

  document.querySelectorAll('.payment-proof-upload input[type="file"]').forEach(input => {
    input.value = "";
    const nameEl = input.closest('.payment-proof-upload')?.querySelector('.upload-filename');
    if (nameEl) nameEl.textContent = 'No file selected';
  });

  document.getElementById("error-1").classList.remove("show");
  document.getElementById("error-2").classList.remove("show");
  document.getElementById("error-3").classList.remove("show");
  updatePaymentPreview();
  renderSlotBoard();
  goToStep(1);
});

document.getElementById("goToSheet").addEventListener("click", () => switchView("schedule"));



/* ================================================================
   SCHEDULE / CALENDAR VIEW
   ================================================================ */
let calState = new Date();
calState.setDate(1);
let selectedCalendarDate = null;

function setCalendarSelection(iso){
  selectedCalendarDate = iso;
  renderCalendar();
  showDayDetail(iso);
}

document.getElementById("prevMonth").addEventListener("click", () => {
  calState.setMonth(calState.getMonth() - 1);
  selectedCalendarDate = null;
  renderCalendar();
  document.getElementById("dayDetail").hidden = true;
});
document.getElementById("nextMonth").addEventListener("click", () => {
  calState.setMonth(calState.getMonth() + 1);
  selectedCalendarDate = null;
  renderCalendar();
  document.getElementById("dayDetail").hidden = true;
});

function renderCalendar(){
  const grid = document.getElementById("calendarGrid");
  const label = document.getElementById("calendarMonthLabel");
  const year = calState.getFullYear();
  const month = calState.getMonth();

  label.textContent = calState.toLocaleDateString(undefined, { month:"long", year:"numeric" });

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const bookings = getBookings();
  const today = todayISO();

  let html = "";
  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => html += `<div class="cal-dow">${d}</div>`);
  for(let i = 0; i < firstDow; i++) html += `<div class="cal-day empty"></div>`;

  for(let d = 1; d <= daysInMonth; d++){
    const iso = `${year}-${pad(month+1)}-${pad(d)}`;
    const dayBookings = bookings.filter(b => b.date === iso).sort((a, b) => (Number(a.hourStart) || 0) - (Number(b.hourStart) || 0));
    const isPast = iso < today;
    const isToday = iso === today;
    const isSelected = selectedCalendarDate === iso;
    let dayHtml = `<div class="cal-day ${isToday ? "today" : ""} ${isPast ? "past" : ""} ${isSelected ? "selected" : ""}" data-date="${iso}">
                    <span class="cal-day-num">${d}</span>`;
    if(dayBookings.length > 0) {
      dayHtml += `<div class="cal-day-times">`;
      dayBookings.slice(0, 2).forEach(b => {
        dayHtml += `<div class="cal-time-slot">${b.time}</div>`;
      });
      if(dayBookings.length > 2) {
        dayHtml += `<div class="cal-time-more">+${dayBookings.length - 2}</div>`;
      }
      dayHtml += `</div>`;
    }
    dayHtml += `</div>`;
    html += dayHtml;
  }
  grid.innerHTML = html;

  grid.querySelectorAll(".cal-day[data-date]").forEach(cell => {
    cell.addEventListener("click", () => {
      const iso = cell.dataset.date;
      setCalendarSelection(iso);
    });
  });
}

function showDayDetail(iso){
  const panel = document.getElementById("dayDetail");
  const title = document.getElementById("dayDetailTitle");
  const table = document.getElementById("dayDetailTable");
  panel.hidden = false;
  panel.classList.add("open");
  title.textContent = formatDateNice(iso);

  let html = `<div class="day-grid">`;
  allTimeSlots().forEach(hour => {
    const time = toTimeLabel(hour);
    html += `<div class="time-column">
              <div class="time-header">${time}</div>`;
    COURTS.forEach(court => {
      const booking = getBookings().find(b => b.court === court && b.date === iso && typeof b.hourStart === 'number' && hour >= b.hourStart && hour < b.hourEnd);
      if(booking) {
        html += `<div class="slot-card booked">
                  <div class="slot-court">${court}</div>
                  <div class="slot-name">${booking.name}</div>
                  <div class="slot-phone">${booking.phone}</div>
                </div>`;
      } else {
        html += `<div class="slot-card open">
                  <div class="slot-court">${court}</div>
                  <div class="slot-status">Available</div>
                </div>`;
      }
    });
    html += `</div>`;
  });
  html += `</div>`;
  table.innerHTML = html;
  panel.scrollIntoView({ behavior:"smooth", block:"nearest" });
}

/* ================================================================
   SHEET (SPREADSHEET) VIEW
   ================================================================ */
const sheetSearchInput = document.getElementById("sheetSearch");
if (sheetSearchInput) {
  sheetSearchInput.addEventListener("input", renderSheet);
}

function renderSheet(){
  const q = (document.getElementById("sheetSearch").value || "").toLowerCase();
  const body = document.getElementById("sheetBody");
  const empty = document.getElementById("sheetEmpty");
  let list = getBookings().slice().sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));

  if(q){
    list = list.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.court.toLowerCase().includes(q) ||
      b.date.includes(q)
    );
  }

  if(list.length === 0){
    body.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  body.innerHTML = list.map((b, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${b.name}</td>
      <td>${b.phone}</td>
      <td>${b.court}</td>
      <td>${b.date}</td>
      <td>${b.time}</td>
      <td>${b.payment}</td>
      <td>${CURRENCY}${b.amount}</td>
      <td><span class="status-pill ${b.status === "Confirmed" ? "status-confirmed" : "status-pending"}">${b.status}</span></td>
      <td><button class="remove-btn" data-id="${b.id}">Remove</button></td>
    </tr>
  `).join("");

  body.querySelectorAll(".remove-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if(confirm("Remove this booking?")){
        removeBooking(btn.dataset.id);
        renderSheet();
        showToast("Booking removed.");
      }
    });
  });
}

/* ================================================================
   INIT
   ================================================================ */
document.getElementById("inputDate").min = todayISO();
if(supabase){
  syncSupabaseBookings().then(() => {
    renderCalendar();
  });
} else {
  renderCalendar();
}

// Payment QR preview handler
function updatePaymentPreview(){
  const method = document.querySelector('input[name="payMethod"]:checked')?.value;
  document.querySelectorAll('.pay-option').forEach(option => {
    const radio = option.querySelector('input[name="payMethod"]');
    option.classList.toggle('selected', radio && radio.value === method);
    const qr = option.querySelector('.payment-qr');
    if(qr){
      qr.hidden = true;
    }
  });

  if(method === 'GCash' || method === 'Bank transfer'){
    const selectedQr = document.querySelector('.pay-option.selected .payment-qr[data-method="' + method + '"]');
    if(!selectedQr) return;
    selectedQr.hidden = false;
    const img = selectedQr.querySelector('.payment-qr-img');
    const label = selectedQr.querySelector('.payment-qr-label');
    if(!img || !label) return;
    if(method === 'GCash') {
      img.src = './img/gcash_qr.jpg';
      img.alt = 'GCash QR code';
      label.textContent = 'GCash — scan to pay';
    } else {
      img.src = './img/bank_qr.jpg';
      img.alt = 'Bank transfer QR code';
      label.textContent = 'Bank transfer — scan to pay';
    }
  }
}

/* ================================================================
   INPUT VALIDATION
   ================================================================ */
const inputName = document.getElementById('inputName');
const inputPhone = document.getElementById('inputPhone');
const errorName = document.getElementById('error-name');
const errorPhone = document.getElementById('error-phone');

// Validate name: allow common real-world name characters
inputName.addEventListener('input', function(){
  const value = this.value.trim();
  const isValid = value.length === 0 || /^[A-Za-zÀ-ÖØ-öø-ÿ'\-.\s]+$/.test(value);
  if(value && !isValid){
    errorName.textContent = '⚠ Please use letters, spaces, periods, apostrophes, or hyphens only.';
    this.classList.add('input-error');
  } else {
    errorName.textContent = '';
    this.classList.remove('input-error');
  }
});

// Validate phone: only numbers, spaces, and dashes
inputPhone.addEventListener('input', function(){
  const value = this.value.trim();
  const digits = value.replace(/\D/g, '');
  const isValid = value.length === 0 || (/^[0-9\s\-\+]+$/.test(value) && digits.length >= 7);
  if(value && !isValid){
    errorPhone.textContent = '⚠ Phone number should contain only numbers, spaces, dashes, or plus signs.';
    this.classList.add('input-error');
  } else {
    errorPhone.textContent = '';
    this.classList.remove('input-error');
  }
});

document.querySelectorAll('input[name="payMethod"]').forEach(r => r.addEventListener('change', updatePaymentPreview));

document.querySelectorAll('.payment-proof-upload input[type="file"]').forEach(input => {
  input.addEventListener('change', () => {
    const wrapper = input.closest('.payment-proof-upload');
    const nameEl = wrapper?.querySelector('.upload-filename');
    const fileName = input.files && input.files[0] ? input.files[0].name : 'No file selected';
    if(nameEl){
      nameEl.textContent = fileName;
    }
  });
});

updatePaymentPreview();
