/* ============================================================
   Paddle&Chill — Pickleball Booking logic
   Data is stored in the browser's localStorage (per device).
   To share bookings across devices, swap the "storage" functions
   near the top for calls to your own backend / database.
   ============================================================ */

/* ---------- CONFIG: edit these to match your facility ---------- */
const COURTS = ["Court 1", "Court 2"];
const OPEN_HOUR = 6;          // 6 AM
const CLOSE_HOUR = 21;        // last slot starts 8 PM (ends 9 PM)
const PRICE_PER_HOUR = 250;   // in PHP (₱)
const CURRENCY = "₱";
const STORAGE_KEY = "paddle_chill_bookings";

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
function addBooking(booking){
  const list = getBookings();
  list.push(booking);
  saveBookings(list);
}
function removeBooking(id){
  saveBookings(getBookings().filter(b => b.id !== id));
}
function isSlotTaken(court, date, time){
  return getBookings().some(b => b.court === court && b.date === date && b.time === time);
}

/* ---------- UTIL ---------- */
function pad(n){ return n.toString().padStart(2,"0"); }
function toTimeLabel(hour){
  const h12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? "AM" : "PM";
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

function switchView(key){
  navButtons.forEach(b => b.classList.toggle("active", b.dataset.view === key));
  Object.entries(views).forEach(([k, id]) => {
    document.getElementById(id).classList.toggle("active", k === key);
  });
  if(key === "schedule") renderCalendar();
  if(key === "sheet") renderSheet();
}
navButtons.forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));

/* ================================================================
   BOOKING WIZARD
   ================================================================ */
let wizardState = {
  name: "", phone: "", court: null, date: null, time: null, hour: null, payMethod: "Cash on arrival"
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
document.getElementById("toStep2").addEventListener("click", () => {
  const name = document.getElementById("inputName").value.trim();
  const phone = document.getElementById("inputPhone").value.trim();
  const err = document.getElementById("error-1");

  if(!name || !phone){
    err.textContent = "Please enter both your name and phone number.";
    err.classList.add("show");
    return;
  }
  err.classList.remove("show");
  wizardState.name = name;
  wizardState.phone = phone;

  const dateInput = document.getElementById("inputDate");
  if(!dateInput.value) dateInput.value = todayISO();
  dateInput.min = todayISO();
  renderSlotBoard();

  goToStep(2);
});

/* --- Step 2: court, date, time --- */
document.getElementById("toStep1Back").addEventListener("click", () => goToStep(1));

document.getElementById("inputDate").addEventListener("change", () => {
  wizardState.court = null; wizardState.time = null; wizardState.hour = null;
  document.getElementById("selectionSummary").hidden = true;
  renderSlotBoard();
});

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
      const taken = isSlotTaken(court, date, time);
      const selected = wizardState.court === court && wizardState.hour === hour;
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
      wizardState.court = btn.dataset.court;
      wizardState.hour = Number(btn.dataset.hour);
      wizardState.time = btn.dataset.time;
      renderSlotBoard();
      const summary = document.getElementById("selectionSummary");
      summary.hidden = false;
      document.getElementById("selectionText").textContent =
        `${wizardState.court} · ${formatDateNice(date)} · ${wizardState.time}`;
    });
  });
}

document.getElementById("toStep3").addEventListener("click", () => {
  const err = document.getElementById("error-2");
  if(!wizardState.court || !wizardState.time){
    err.textContent = "Please select an available court and time slot.";
    err.classList.add("show");
    return;
  }
  // Double-check availability in case another booking was just made
  if(isSlotTaken(wizardState.court, wizardState.date, wizardState.time)){
    err.textContent = `${wizardState.court} at ${wizardState.time} was just booked by someone else. Please choose another slot.`;
    err.classList.add("show");
    renderSlotBoard();
    return;
  }
  err.classList.remove("show");
  renderOrderSummary();
  goToStep(3);
});
document.getElementById("toStep2Back").addEventListener("click", () => goToStep(2));

function renderOrderSummary(){
  const box = document.getElementById("orderSummary");
  box.innerHTML = `
    <div><span>Name</span><span>${wizardState.name}</span></div>
    <div><span>Court</span><span>${wizardState.court}</span></div>
    <div><span>Date</span><span>${formatDateNice(wizardState.date)}</span></div>
    <div><span>Time</span><span>${wizardState.time} – ${toTimeLabel(wizardState.hour + 1)}</span></div>
    <div class="total"><span>Total (1 hr)</span><span>${CURRENCY}${PRICE_PER_HOUR}</span></div>
  `;
}

/* --- Step 3: payment --- */
document.getElementById("confirmBooking").addEventListener("click", () => {
  const method = document.querySelector('input[name="payMethod"]:checked').value;

  // Final availability guard right before writing the booking
  if(isSlotTaken(wizardState.court, wizardState.date, wizardState.time)){
    const err = document.getElementById("error-3");
    err.textContent = "That slot was just taken. Please go back and pick another.";
    err.classList.add("show");
    return;
  }

  const booking = {
    id: genId(),
    name: wizardState.name,
    phone: wizardState.phone,
    court: wizardState.court,
    date: wizardState.date,
    time: wizardState.time,
    payment: method,
    amount: PRICE_PER_HOUR,
    status: method === "Cash on arrival" ? "Pending" : "Confirmed",
    createdAt: new Date().toISOString()
  };
  addBooking(booking);
  renderConfirmation(booking);
  goToStep(4);
  showToast("Booking confirmed — you're on the board!");
});

function renderConfirmation(b){
  document.getElementById("confirmDetails").innerHTML = `
    <div><span>Booking ref</span><span>${b.id}</span></div>
    <div><span>Name</span><span>${b.name}</span></div>
    <div><span>Court</span><span>${b.court}</span></div>
    <div><span>Date</span><span>${formatDateNice(b.date)}</span></div>
    <div><span>Time</span><span>${b.time}</span></div>
    <div><span>Payment</span><span>${b.payment}</span></div>
    <div><span>Status</span><span>${b.status}</span></div>
  `;
}

document.getElementById("bookAnother").addEventListener("click", () => {
  wizardState = { name:"", phone:"", court:null, date:null, time:null, hour:null, payMethod:"Cash on arrival" };
  document.getElementById("inputName").value = "";
  document.getElementById("inputPhone").value = "";
  document.getElementById("inputDate").value = "";
  document.getElementById("selectionSummary").hidden = true;
  goToStep(1);
});

document.getElementById("goToSheet").addEventListener("click", () => switchView("sheet"));



/* ================================================================
   SCHEDULE / CALENDAR VIEW
   ================================================================ */
let calState = new Date();
calState.setDate(1);

document.getElementById("prevMonth").addEventListener("click", () => {
  calState.setMonth(calState.getMonth() - 1);
  renderCalendar();
});
document.getElementById("nextMonth").addEventListener("click", () => {
  calState.setMonth(calState.getMonth() + 1);
  renderCalendar();
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
    const dayBookings = bookings.filter(b => b.date === iso).sort((a, b) => a.time.localeCompare(b.time));
    const isPast = iso < today;
    const isToday = iso === today;
    let dayHtml = `<div class="cal-day ${isToday ? "today" : ""} ${isPast ? "past" : ""}" data-date="${iso}">
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
    cell.addEventListener("click", () => showDayDetail(cell.dataset.date));
  });
}

function showDayDetail(iso){
  const panel = document.getElementById("dayDetail");
  const title = document.getElementById("dayDetailTitle");
  const table = document.getElementById("dayDetailTable");
  panel.hidden = false;
  title.textContent = formatDateNice(iso);

  let html = `<div class="day-grid">`;
  allTimeSlots().forEach(hour => {
    const time = toTimeLabel(hour);
    html += `<div class="time-column">
              <div class="time-header">${time}</div>`;
    COURTS.forEach(court => {
      const booking = getBookings().find(b => b.court === court && b.date === iso && b.time === time);
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
document.getElementById("sheetSearch").addEventListener("input", renderSheet);

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
renderCalendar();
