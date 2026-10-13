const bloodGroups = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];
const redCellMatches = {
  "O-": ["O-"],
  "O+": ["O-", "O+"],
  "A-": ["O-", "A-"],
  "A+": ["O-", "O+", "A-", "A+"],
  "B-": ["O-", "B-"],
  "B+": ["O-", "O+", "B-", "B+"],
  "AB-": ["O-", "A-", "B-", "AB-"],
  "AB+": bloodGroups
};

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const starterData = {
  inventory: [
    { bloodGroup: "O-", units: 3, threshold: 8 }, { bloodGroup: "O+", units: 18, threshold: 12 },
    { bloodGroup: "A-", units: 6, threshold: 8 }, { bloodGroup: "A+", units: 22, threshold: 12 },
    { bloodGroup: "B-", units: 4, threshold: 8 }, { bloodGroup: "B+", units: 14, threshold: 10 },
    { bloodGroup: "AB-", units: 7, threshold: 6 }, { bloodGroup: "AB+", units: 10, threshold: 8 }
  ],
  donors: [
    { id: 1, name: "Aarav Mehta", bloodGroup: "O-", city: "Pune", phone: "*** *** 2841", lastDonation: daysAgo(102), donations: 5 },
    { id: 2, name: "Anaya Shah", bloodGroup: "O+", city: "Pune", phone: "*** *** 6517", lastDonation: daysAgo(71), donations: 2 },
    { id: 3, name: "Rohan Kulkarni", bloodGroup: "A-", city: "Pune", phone: "*** *** 9304", lastDonation: daysAgo(39), donations: 4 },
    { id: 4, name: "Sara Thomas", bloodGroup: "A+", city: "Pune", phone: "*** *** 1182", lastDonation: daysAgo(120), donations: 8 },
    { id: 5, name: "Kabir Nair", bloodGroup: "B+", city: "Mumbai", phone: "*** *** 4405", lastDonation: daysAgo(61), donations: 1 },
    { id: 6, name: "Isha Patel", bloodGroup: "O-", city: "Mumbai", phone: "*** *** 7729", lastDonation: "", donations: 0 },
    { id: 7, name: "Dev Malhotra", bloodGroup: "AB+", city: "Pune", phone: "*** *** 3056", lastDonation: daysAgo(200), donations: 11 },
    { id: 8, name: "Mira Rao", bloodGroup: "B-", city: "Pune", phone: "*** *** 8146", lastDonation: daysAgo(58), donations: 3 }
  ],
  requests: [
    { id: 1, patientName: "Patient A", hospital: "Sahyadri Hospital", city: "Pune", bloodGroup: "O-", units: 2, urgency: "CRITICAL", status: "OPEN", createdAt: new Date().toISOString() },
    { id: 2, patientName: "Patient B", hospital: "Ruby Hall Clinic", city: "Pune", bloodGroup: "A+", units: 3, urgency: "URGENT", status: "OPEN", createdAt: new Date(Date.now() - 3600000).toISOString() },
    { id: 3, patientName: "Patient C", hospital: "KEM Hospital", city: "Mumbai", bloodGroup: "B-", units: 1, urgency: "STANDARD", status: "MATCHED", createdAt: new Date(Date.now() - 7200000).toISOString() }
  ],
  appointments: [],
  adjustments: []
};

const storageKey = "bloodbridge-demo-v1";
let data = loadSavedData();
let liveApi = false;
let currentPage = "dashboard";
let wizardStep = 1;
let toastTimer;

function loadSavedData() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.inventory && parsed.donors && parsed.requests) return parsed;
    }
  } catch {}
  return structuredClone(starterData);
}

function persistDemoData() {
  if (liveApi) return;
  try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch {}
}

function isEligible(donor) {
  if (!donor.lastDonation) return true;
  const lastDonation = new Date(`${donor.lastDonation}T00:00:00`);
  const daysSince = Math.floor((new Date().setHours(0, 0, 0, 0) - lastDonation.getTime()) / 86400000);
  return daysSince >= 56;
}

function eligibilityDetails(donor) {
  if (!donor.lastDonation) return { eligible: true, label: "Eligible", detail: "Last donation not recorded" };
  const lastDonation = new Date(`${donor.lastDonation}T00:00:00`);
  const today = new Date();
  const daysSince = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(lastDonation.getFullYear(), lastDonation.getMonth(), lastDonation.getDate())) / 86400000);
  if (daysSince >= 56) {
    return { eligible: true, label: "Eligible", detail: `Last donated ${lastDonation.toLocaleDateString()}` };
  }
  const daysRemaining = 56 - daysSince;
  const nextEligible = new Date(lastDonation);
  nextEligible.setDate(nextEligible.getDate() + 56);
  return {
    eligible: false,
    label: `Wait · ${daysRemaining}d`,
    detail: `Eligible ${nextEligible.toLocaleDateString()}`
  };
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function stockMarkup(item, large = false) {
  const critical = item.units < item.threshold;
  const fill = Math.min(100, Math.round((item.units / (item.threshold * 1.8)) * 100));
  const countLabel = `${item.units} ${item.units === 1 ? "unit" : "units"}`;
  return `<div class="${large ? "inventory-large" : "stock-item"} ${critical ? "critical" : ""}">
    <div class="${large ? "inventory-large-top" : "stock-top"}">
      <span class="blood-type"><i class="mini-drop" aria-hidden="true"></i>${escapeHtml(item.bloodGroup.replace("-", "−").replace("+", "+"))}</span>
      <span class="stock-units"><strong>${item.units}</strong> units</span>
    </div>
    <div class="stock-track" role="meter" aria-label="${escapeHtml(item.bloodGroup)} stock" aria-valuemin="0" aria-valuemax="${item.threshold * 1.8}" aria-valuenow="${item.units}"><div class="stock-fill" style="width:${fill}%"></div></div>
    <div class="stock-foot"><span>Threshold ${item.threshold} units</span><span class="stock-status">${critical ? "Low stock" : "In range"}</span></div>
  </div>`;
}

function urgencyClass(urgency) {
  return urgency === "CRITICAL" ? "urgency-critical" : urgency === "URGENT" ? "urgency-urgent" : "urgency-standard";
}

function statusClass(status) {
  return status === "MATCHED" ? "status-matched" : status === "CLOSED" ? "status-closed" : "status-open";
}

function displayGroup(group) {
  return escapeHtml(group).replace("-", "−");
}

function getMetrics() {
  const donations = data.donors.reduce((sum, donor) => sum + Number(donor.donations || 0), 0);
  return {
    donorCount: data.donors.length,
    unitsAvailable: data.inventory.reduce((sum, item) => sum + Number(item.units), 0),
    openRequests: data.requests.filter((request) => request.status === "OPEN").length,
    livesSaved: donations * 3
  };
}

function requestRows(requests) {
  if (!requests.length) return `<tr><td colspan="${currentPage === "requests" ? 6 : 5}"><div class="empty-state">No blood requests yet.</div></td></tr>`;
  const visibleRequests = currentPage === "requests" ? requests : requests.slice(0, 5);
  return visibleRequests.map((request) => `<tr>
    <td><div class="person-cell"><span class="request-avatar">${escapeHtml(initials(request.patientName || "Patient"))}</span><span class="person-copy"><strong>${escapeHtml(request.patientName)}</strong><span>${escapeHtml(request.hospital)}</span></span></div></td>
    <td><span class="group-pill">${displayGroup(request.bloodGroup)}</span></td>
    <td><span class="urgency-pill ${urgencyClass(request.urgency)}">${escapeHtml(request.urgency.toLowerCase())}</span></td>
    <td>${Number(request.units)} ${Number(request.units) === 1 ? "unit" : "units"}</td>
    <td><span class="status-pill ${statusClass(request.status)}">${escapeHtml(request.status.toLowerCase())}</span></td>
    ${currentPage === "requests" ? `<td><select class="table-select" data-request-status data-id="${Number(request.id)}" aria-label="Update status for ${escapeHtml(request.patientName)}">${["OPEN", "MATCHED", "CLOSED"].map((status) => `<option value="${status}" ${status === request.status ? "selected" : ""}>${status[0] + status.slice(1).toLowerCase()}</option>`).join("")}</select></td>` : ""}
  </tr>`).join("");
}

function donorRows(donors, compact = false) {
  if (!donors.length) return `<div class="empty-state">No donors match these filters. Try changing your search or clearing the filters.</div>`;
  return donors.map((donor) => {
    const eligibility = eligibilityDetails(donor);
    const eligible = donor.eligible ?? eligibility.eligible;
    const badge = donor.donations >= 10 ? "Gold" : donor.donations >= 5 ? "Silver" : donor.donations >= 1 ? "Bronze" : "New donor";
    return `<div class="${compact ? "donor-row" : "donor-card"}">
      <span class="donor-avatar">${escapeHtml(initials(donor.name))}</span>
      <span class="donor-main"><strong>${escapeHtml(donor.name)}</strong><span>${escapeHtml(donor.city)} · ${displayGroup(donor.bloodGroup)} · ${Number(donor.donations)} donations · ${badge}</span>${compact ? "" : `<span class="donor-eligibility-detail">${escapeHtml(eligibility.detail)}</span>`}</span>
      <span class="donor-trailing"><span class="eligibility-pill ${eligible ? "" : "ineligible"}" title="${escapeHtml(eligibility.detail)}">${eligible ? "Eligible" : escapeHtml(eligibility.label)}</span>${compact ? "" : `<span class="donor-card-actions"><button class="button button-quiet button-small" data-action="edit-donor" data-id="${Number(donor.id)}" type="button">Edit</button><button class="button button-quiet button-small" data-action="deactivate-donor" data-id="${Number(donor.id)}" type="button">Deactivate</button></span>`}</span>
    </div>`;
  }).join("");
}

function pageHeading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><span class="eyebrow">HOSPITAL WORKSPACE</span><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div>${action}</div>`;
}

function dashboardMarkup() {
  const metrics = getMetrics();
  const lowStock = data.inventory.find((item) => item.bloodGroup === "O-");
  const recentDonors = data.donors.slice(0, 4);
  return `${pageHeading("Good morning, Sahana", "Here is what's happening across your blood network today.", `<button class="button button-primary" data-action="new-request"><span aria-hidden="true">＋</span> Create request</button>`)}
    <section class="emergency-banner" aria-label="Urgent inventory alert">
      <div class="emergency-copy"><span class="alert-mark" aria-hidden="true">!</span><div><span class="eyebrow">PRIORITY SHORTAGE · O NEGATIVE</span><h2>${lowStock ? lowStock.units : 0} units left. Help us replenish.</h2><p>Universal donor type · below the ${lowStock ? lowStock.threshold : 8}-unit safety threshold</p></div></div>
      <button class="button" data-action="find-donors" data-group="O-">Find compatible donors <span aria-hidden="true">→</span></button>
    </section>
    <section class="metric-grid" aria-label="Network at a glance">
      <div class="metric"><div class="metric-top"><span class="metric-label">Registered donors</span><span class="metric-glyph" aria-hidden="true">♧</span></div><div class="metric-value"><strong>${metrics.donorCount.toLocaleString()}</strong><span>in this workspace</span></div></div>
      <div class="metric"><div class="metric-top"><span class="metric-label">Units available</span><span class="metric-glyph" aria-hidden="true">◉</span></div><div class="metric-value"><strong>${metrics.unitsAvailable}</strong><span>across 8 blood groups</span></div></div>
      <div class="metric"><div class="metric-top"><span class="metric-label">Open requests</span><span class="metric-glyph" aria-hidden="true">♡</span></div><div class="metric-value"><strong>${metrics.openRequests}</strong><span>awaiting a match</span></div></div>
      <div class="metric"><div class="metric-top"><span class="metric-label">Lives supported</span><span class="metric-glyph" aria-hidden="true">✳</span></div><div class="metric-value"><strong>${metrics.livesSaved}</strong><span>estimated · 3 per donation</span></div></div>
    </section>
    <section class="inventory-section">
      <div class="section-head"><div><h2>Blood inventory</h2><p>Available units by blood group</p></div><button class="text-link" data-page="inventory">Full inventory <span aria-hidden="true">→</span></button></div>
      <div class="stock-grid">${data.inventory.map((item) => stockMarkup(item)).join("")}</div>
    </section>
    <div class="lower-grid">
      <section class="panel"><div class="panel-head"><div><h2>Latest requests</h2><p>Requests that need attention</p></div><button class="text-link" data-page="requests">All requests →</button></div>
        <div class="table-wrap"><table><thead><tr><th>Patient / facility</th><th>Group</th><th>Priority</th><th>Need</th><th>Status</th></tr></thead><tbody>${requestRows(data.requests)}</tbody></table></div>
      </section>
      <section class="panel"><div class="panel-head"><div><h2>Donor community</h2><p>Recent registered donors</p></div></div><div class="donor-list">${donorRows(recentDonors, true)}</div><div class="view-all-row"><button class="text-link" data-page="donors">Explore donor network →</button></div></section>
    </div>`;
}

function donorsMarkup() {
  return `${pageHeading("Donor network", "Find compatible donors and check their donation eligibility.", `<button class="button button-primary" data-action="new-donor">＋ Register donor</button>`)}
    <div class="toolbar">
      <label class="search-field"><input id="donor-search" type="search" placeholder="Search name, city, phone or blood group" aria-label="Search donors by name, city, phone or blood group"></label>
      <select id="recipient-filter" aria-label="Filter by recipient blood group"><option value="">Any blood group</option>${bloodGroups.map((group) => `<option value="${group}">Recipient ${displayGroup(group)}</option>`).join("")}</select>
      <select id="donor-city-filter" aria-label="Filter by city"><option value="">All cities</option>${[...new Set(data.donors.map((donor) => donor.city))].sort().map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join("")}</select>
      <select id="donor-eligibility-filter" aria-label="Filter by donation eligibility"><option value="">All eligibility</option><option value="eligible">Eligible now</option><option value="waiting">In waiting period</option></select>
      <button class="button button-quiet button-small" id="clear-donor-filters" type="button" hidden>Clear filters</button>
    </div>
    <div id="compatibility-message"></div>
    <p class="donor-result-summary" id="donor-result-summary" aria-live="polite"></p>
    <div class="donor-results" id="donor-results">${donorRows(data.donors)}</div>`;
}

function requestsMarkup() {
  return `${pageHeading("Blood requests", "Review active patient needs and coordinate a timely response.", `<button class="button button-primary" data-action="new-request"><span aria-hidden="true">＋</span> Create request</button>`)}
    <section class="panel"><div class="panel-head"><div><h2>All requests</h2><p>${data.requests.length} requests · change a status to match, close, or reopen a request</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Patient / facility</th><th>Group</th><th>Priority</th><th>Need</th><th>Status</th><th>Manage</th></tr></thead><tbody>${requestRows(data.requests)}</tbody></table></div>
    </section>`;
}

function inventoryMarkup() {
  const critical = data.inventory.filter((item) => item.units < item.threshold).length;
  const history = data.adjustments.length ? data.adjustments.map((adjustment) => `<tr><td>${escapeHtml(new Date(adjustment.createdAt).toLocaleString())}</td><td><span class="group-pill">${displayGroup(adjustment.bloodGroup)}</span></td><td class="${Number(adjustment.unitsDelta) > 0 ? "delta-add" : "delta-remove"}">${Number(adjustment.unitsDelta) > 0 ? "+" : ""}${Number(adjustment.unitsDelta)}</td><td>${escapeHtml(adjustment.reason)}</td></tr>`).join("") : `<tr><td colspan="4"><div class="empty-state">No stock adjustments have been recorded.</div></td></tr>`;
  return `${pageHeading("Blood inventory", "A live view of stock levels across all blood groups.", `<button class="button button-primary" data-action="adjust-inventory">＋ Record adjustment</button>`)}
    <div class="section-head"><div><h2>Available units</h2><p>Low stock is measured against each group's safety threshold.</p></div><span class="urgency-pill ${critical ? "urgency-urgent" : "urgency-standard"}">${critical} low-stock groups</span></div>
    <div class="inventory-page-grid">${data.inventory.map((item) => stockMarkup(item, true)).join("")}</div>
    <section class="panel history-panel"><div class="panel-head"><div><h2>Recent adjustments</h2><p>Latest 50 additions, removals, and completed donations</p></div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Group</th><th>Change</th><th>Reason</th></tr></thead><tbody>${history}</tbody></table></div></section>
    <div class="inventory-note"><strong>Stock records:</strong> each manual adjustment and completed donation is recorded in the audit history. Verify physical stock and expiry dates with your blood bank before clinical decisions.</div>`;
}

function appointmentsMarkup() {
  const appointments = data.appointments || [];
  const rows = appointments.length ? appointments.map((appointment) => `<tr>
    <td><div class="person-cell"><span class="donor-avatar">${escapeHtml(initials(appointment.donorName))}</span><span class="person-copy"><strong>${escapeHtml(appointment.donorName)}</strong><span>${displayGroup(appointment.bloodGroup)}</span></span></div></td>
    <td>${appointment.patientName ? escapeHtml(appointment.patientName) : "Community donation"}</td>
    <td>${escapeHtml(new Date(appointment.scheduledAt).toLocaleString())}</td>
    <td>${escapeHtml(appointment.location)}</td>
    <td><span class="status-pill ${appointment.status === "COMPLETED" ? "status-matched" : appointment.status === "CANCELLED" ? "status-closed" : "status-open"}">${escapeHtml(appointment.status.toLowerCase())}</span></td>
    <td>${appointment.status === "SCHEDULED" ? `<span class="table-actions"><button class="button button-quiet button-small" data-action="complete-appointment" data-id="${Number(appointment.id)}" type="button">Complete</button><button class="button button-quiet button-small" data-action="cancel-appointment" data-id="${Number(appointment.id)}" type="button">Cancel</button></span>` : "—"}</td>
  </tr>`).join("") : `<tr><td colspan="6"><div class="empty-state">No donation appointments scheduled yet.</div></td></tr>`;
  return `${pageHeading("Donation appointments", "Schedule eligible donors and track completed or cancelled donations.", `<button class="button button-primary" data-action="new-appointment">＋ Schedule appointment</button>`)}
    <section class="panel"><div class="panel-head"><div><h2>Appointments</h2><p>${appointments.filter((appointment) => appointment.status === "SCHEDULED").length} scheduled · completing an appointment updates donor history and stock</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Donor</th><th>Linked request</th><th>Date and time</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
}

function setConnection(isLive) {
  liveApi = isLive;
  const label = document.getElementById("connection-label");
  const state = label?.parentElement;
  if (label) label.textContent = isLive ? "API connected" : "Demo workspace";
  state?.classList.toggle("live", isLive);
}

function renderPage(page = currentPage) {
  currentPage = page;
  const content = document.getElementById("page-content");
  const labels = { dashboard: "Overview", donors: "Donors", requests: "Blood requests", inventory: "Inventory", appointments: "Appointments" };
  const renderers = { dashboard: dashboardMarkup, donors: donorsMarkup, requests: requestsMarkup, inventory: inventoryMarkup, appointments: appointmentsMarkup };
  content.innerHTML = (renderers[page] || dashboardMarkup)();
  document.getElementById("breadcrumb-current").textContent = labels[page] || "Overview";
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  document.getElementById("donor-nav-count").textContent = data.donors.length;
  document.getElementById("request-nav-count").textContent = data.requests.filter((request) => request.status === "OPEN").length;
  document.getElementById("appointment-nav-count").textContent = (data.appointments || []).filter((appointment) => appointment.status === "SCHEDULED").length;
  if (page === "donors") applyDonorFilters();
}

function applyDonorFilters() {
  const search = document.getElementById("donor-search")?.value.trim().toLowerCase() || "";
  const group = document.getElementById("recipient-filter")?.value || "";
  const city = document.getElementById("donor-city-filter")?.value || "";
  const eligibilityFilter = document.getElementById("donor-eligibility-filter")?.value || "";
  const compatible = group ? redCellMatches[group] : [];
  const filtered = data.donors.filter((donor) => {
    const matchesSearch = !search || `${donor.name} ${donor.city} ${donor.phone || ""} ${donor.bloodGroup}`.toLowerCase().includes(search);
    const matchesGroup = !group || compatible.includes(donor.bloodGroup);
    const matchesCity = !city || donor.city === city;
    const eligible = donor.eligible ?? isEligible(donor);
    const matchesEligibility = !eligibilityFilter || (eligibilityFilter === "eligible" ? eligible : !eligible);
    return matchesSearch && matchesGroup && matchesCity && matchesEligibility;
  });
  document.getElementById("donor-results").innerHTML = donorRows(filtered);
  const eligibleCount = filtered.filter((donor) => donor.eligible ?? isEligible(donor)).length;
  document.getElementById("donor-result-summary").textContent = `Showing ${filtered.length} of ${data.donors.length} donors · ${eligibleCount} eligible now`;
  document.getElementById("clear-donor-filters").hidden = !search && !group && !city && !eligibilityFilter;
  const message = document.getElementById("compatibility-message");
  if (!message) return;
  if (!group) {
    message.innerHTML = "";
    return;
  }
  message.innerHTML = `<div class="compatible-banner"><span aria-hidden="true">✓</span><span><strong>${eligibleCount} eligible matches</strong> for recipient ${displayGroup(group)} · red-cell compatibility · 56-day interval</span></div>`;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3400);
}

async function apiMutation(path, method, body) {
  if (!liveApi) throw new Error("Connect to the live API before changing workspace data.");
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let result = {};
  if (text) {
    try { result = JSON.parse(text); } catch { result = { message: text }; }
  }
  if (!response.ok) throw new Error(result.message || result.detail || result.error || `Request failed (${response.status}).`);
  return result;
}

function closeManagementModals() {
  ["donor-modal", "inventory-modal", "appointment-modal"].forEach((id) => { document.getElementById(id).hidden = true; });
}

function openDonorModal(donor = null) {
  const form = document.getElementById("donor-form");
  form.reset();
  form.elements.donorId.value = donor ? donor.id : "";
  if (donor) {
    form.elements.name.value = donor.name;
    form.elements.bloodGroup.value = donor.bloodGroup;
    form.elements.city.value = donor.city;
    form.elements.phone.value = donor.phone;
    form.elements.lastDonation.value = donor.lastDonation || "";
  }
  document.getElementById("donor-modal-title").textContent = donor ? "Update donor profile" : "Register a donor";
  document.getElementById("donor-modal").hidden = false;
  form.elements.name.focus();
}

function openAppointmentModal() {
  const form = document.getElementById("appointment-form");
  form.reset();
  const eligibleDonors = data.donors.filter((donor) => donor.eligible ?? isEligible(donor));
  form.elements.donorId.innerHTML = eligibleDonors.map((donor) =>
    `<option value="${Number(donor.id)}">${escapeHtml(donor.name)} · ${displayGroup(donor.bloodGroup)} · ${escapeHtml(donor.city)}</option>`
  ).join("");
  form.elements.donorId.disabled = eligibleDonors.length === 0;
  form.elements.donorId.required = eligibleDonors.length > 0;
  form.elements.requestId.innerHTML = `<option value="">No linked request</option>${data.requests.filter((request) => request.status === "OPEN" || request.status === "MATCHED").map((request) =>
    `<option value="${Number(request.id)}">${escapeHtml(request.patientName)} · ${displayGroup(request.bloodGroup)} · ${escapeHtml(request.city)}</option>`
  ).join("")}`;
  const defaultTime = new Date(Date.now() + 86400000);
  defaultTime.setHours(10, 0, 0, 0);
  const localDateTime = new Date(defaultTime.getTime() - defaultTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  form.elements.scheduledAt.min = localDateTime;
  form.elements.scheduledAt.value = localDateTime;
  document.getElementById("appointment-modal").hidden = false;
  if (!eligibleDonors.length) showToast("There are no currently eligible active donors to schedule.");
}

function openRequestModal() {
  const modal = document.getElementById("request-modal");
  modal.hidden = false;
  wizardStep = 1;
  updateWizard();
  modal.querySelector("input[name='patientName']").focus();
}

function closeRequestModal() {
  document.getElementById("request-modal").hidden = true;
}

function updateWizard() {
  document.querySelectorAll(".wizard-panel").forEach((panel) => { panel.hidden = Number(panel.dataset.panel) !== wizardStep; });
  document.querySelectorAll(".wizard-step").forEach((step) => {
    const number = Number(step.dataset.stepIndicator);
    step.classList.toggle("active", number === wizardStep);
    step.classList.toggle("complete", number < wizardStep);
  });
  document.getElementById("wizard-back").hidden = wizardStep === 1;
  document.getElementById("wizard-next").hidden = wizardStep === 3;
  document.getElementById("wizard-submit").hidden = wizardStep !== 3;
  if (wizardStep === 3) updateRequestReview();
}

function updateRequestReview() {
  const form = document.getElementById("request-form");
  const values = new FormData(form);
  const labels = { STANDARD: "Within 48 hours", URGENT: "Urgent · within 12 hours", CRITICAL: "Critical · immediately" };
  document.getElementById("request-review").innerHTML = [
    ["Patient", values.get("patientName")], ["Care center", values.get("hospital")],
    ["City", values.get("city")], ["Blood group", displayGroup(values.get("bloodGroup"))],
    ["Units", `${values.get("units")} units`], ["Priority", labels[values.get("urgency")]]
  ].map(([label, value]) => `<div class="review-item"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
}

async function submitRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  if (!values.get("verified")) {
    form.elements.verified.reportValidity();
    return;
  }
  const request = {
    patientName: String(values.get("patientName")).trim(),
    hospital: String(values.get("hospital")).trim(),
    city: String(values.get("city")).trim(),
    bloodGroup: values.get("bloodGroup"),
    units: Number(values.get("units")),
    urgency: values.get("urgency"),
    status: "OPEN",
    createdAt: new Date().toISOString()
  };
  if (liveApi) {
    try {
      const response = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      if (!response.ok) throw new Error("Request could not be saved.");
    } catch {
      showToast("Could not reach the API. Your request was not submitted.");
      return;
    }
    await refreshFromApi();
  } else {
    request.id = Date.now();
    data.requests.unshift(request);
    persistDemoData();
  }
  closeRequestModal();
  form.reset();
  renderPage("requests");
  showToast(liveApi ? "Request saved to the workspace." : "Demo request added to this browser.");
}

async function refreshFromApi() {
  try {
    const response = await fetch("/api/dashboard", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("API unavailable");
    const dashboard = await response.json();
    const endpoints = ["/api/donors", "/api/requests", "/api/appointments", "/api/inventory/adjustments"];
    const responses = await Promise.all(endpoints.map((endpoint) => fetch(endpoint)));
    if (responses.some((item) => !item.ok)) throw new Error("API unavailable");
    const [donors, requests, appointments, adjustments] = await Promise.all(responses.map((item) => item.json()));
    data = { inventory: dashboard.inventory, donors, requests, appointments, adjustments };
    setConnection(true);
  } catch {
    setConnection(false);
  }
}

document.addEventListener("click", async (event) => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    renderPage(pageButton.dataset.page);
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (actionButton?.dataset.action === "new-request") openRequestModal();
  if (actionButton?.dataset.action === "new-donor") openDonorModal();
  if (actionButton?.dataset.action === "adjust-inventory") {
    document.getElementById("inventory-form").reset();
    document.getElementById("inventory-modal").hidden = false;
  }
  if (actionButton?.dataset.action === "new-appointment") openAppointmentModal();
  if (actionButton?.dataset.action === "edit-donor") {
    const donor = data.donors.find((item) => item.id === Number(actionButton.dataset.id));
    if (donor) openDonorModal(donor);
  }
  if (actionButton?.dataset.action === "deactivate-donor") {
    if (window.confirm("Deactivate this donor? Their history will be preserved, but they will no longer appear in donor searches.")) {
      try {
        await apiMutation(`/api/donors/${actionButton.dataset.id}`, "DELETE");
        await refreshFromApi();
        renderPage(currentPage);
        showToast("Donor deactivated.");
      } catch (error) { showToast(error.message); }
    }
  }
  if (actionButton?.dataset.action === "complete-appointment" || actionButton?.dataset.action === "cancel-appointment") {
    const completing = actionButton.dataset.action === "complete-appointment";
    if (!completing || window.confirm("Complete this donation? This records the donor's donation and adds one unit to inventory.")) {
      try {
        await apiMutation(`/api/appointments/${actionButton.dataset.id}/status`, "PATCH", { status: completing ? "COMPLETED" : "CANCELLED" });
        await refreshFromApi();
        renderPage(currentPage);
        showToast(completing ? "Donation completed; donor history and inventory updated." : "Appointment cancelled.");
      } catch (error) { showToast(error.message); }
    }
  }
  if (actionButton?.dataset.action === "find-donors") {
    renderPage("donors");
    document.getElementById("recipient-filter").value = actionButton.dataset.group;
    applyDonorFilters();
  }
  if (event.target.closest(".close-modal")) {
    closeRequestModal();
    closeManagementModals();
  }
  if (["request-modal", "donor-modal", "inventory-modal", "appointment-modal"].includes(event.target.id)) {
    closeRequestModal();
    closeManagementModals();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "donor-search") applyDonorFilters();
});
document.addEventListener("change", (event) => {
  if (["recipient-filter", "donor-city-filter", "donor-eligibility-filter"].includes(event.target.id)) applyDonorFilters();
  if (!event.target.matches("[data-request-status]")) return;
  const selector = event.target;
  apiMutation(`/api/requests/${selector.dataset.id}/status`, "PATCH", { status: selector.value })
    .then(async () => {
      await refreshFromApi();
      renderPage(currentPage);
      showToast("Request status updated.");
    })
    .catch((error) => {
      showToast(error.message);
      renderPage(currentPage);
    });
});
document.addEventListener("click", (event) => {
  if (event.target.id !== "clear-donor-filters") return;
  document.getElementById("donor-search").value = "";
  document.getElementById("recipient-filter").value = "";
  document.getElementById("donor-city-filter").value = "";
  document.getElementById("donor-eligibility-filter").value = "";
  applyDonorFilters();
});

document.getElementById("wizard-next").addEventListener("click", () => {
  const activePanel = document.querySelector(`.wizard-panel[data-panel="${wizardStep}"]`);
  const invalid = [...activePanel.querySelectorAll("input,select")].find((field) => !field.checkValidity());
  if (invalid) {
    invalid.reportValidity();
    invalid.focus();
    return;
  }
  wizardStep = Math.min(3, wizardStep + 1);
  updateWizard();
});
document.getElementById("wizard-back").addEventListener("click", () => {
  wizardStep = Math.max(1, wizardStep - 1);
  updateWizard();
});
document.getElementById("request-form").addEventListener("submit", submitRequest);
document.getElementById("donor-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const donor = {
    name: String(values.get("name")).trim(),
    bloodGroup: values.get("bloodGroup"),
    city: String(values.get("city")).trim(),
    phone: String(values.get("phone")).trim(),
    lastDonation: values.get("lastDonation") || null
  };
  const donorId = values.get("donorId");
  try {
    await apiMutation(donorId ? `/api/donors/${donorId}` : "/api/donors", donorId ? "PUT" : "POST", donor);
    closeManagementModals();
    await refreshFromApi();
    renderPage("donors");
    showToast(donorId ? "Donor profile updated." : "Donor registered.");
  } catch (error) { showToast(error.message); }
});
document.getElementById("inventory-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  try {
    await apiMutation("/api/inventory/adjustments", "POST", {
      bloodGroup: values.get("bloodGroup"),
      unitsDelta: Number(values.get("unitsDelta")),
      reason: String(values.get("reason")).trim()
    });
    closeManagementModals();
    await refreshFromApi();
    renderPage("inventory");
    showToast("Inventory adjusted and recorded.");
  } catch (error) { showToast(error.message); }
});
document.getElementById("appointment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  try {
    await apiMutation("/api/appointments", "POST", {
      donorId: Number(values.get("donorId")),
      requestId: values.get("requestId") ? Number(values.get("requestId")) : null,
      scheduledAt: values.get("scheduledAt"),
      location: String(values.get("location")).trim()
    });
    closeManagementModals();
    await refreshFromApi();
    renderPage("appointments");
    showToast("Donation appointment scheduled.");
  } catch (error) { showToast(error.message); }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeRequestModal();
    closeManagementModals();
  }
});

setConnection(false);
renderPage("dashboard");
refreshFromApi().then(() => renderPage(currentPage));