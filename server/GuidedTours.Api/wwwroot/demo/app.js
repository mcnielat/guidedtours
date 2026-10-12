// Demo host app logic. Note: nothing here knows about any specific tour.
(function () {
  const TASKS = [
    { id: "e-ref1", title: "Report request — J. Smith", from: "Smith & Co Lawyers", category: "Medico-legal", status: "Open", received: "09:12",
      thread: [
        { from: "Smith & Co Lawyers", when: "Today 09:12", text: "Please provide a medical report for our client J. Smith regarding the incident on 2 March." },
        { from: "Front desk", when: "Today 09:40", text: "Thanks — we've logged this and will confirm the GP and timeframe shortly." },
      ] },
    { id: "e-ref2", title: "Referral — cardiology", from: "City Hospital", category: "Referral", status: "Picked up", received: "08:47", thread: [] },
    { id: "e-ref3", title: "Pathology results batch", from: "Lab Services", category: "Results", status: "Open", received: "Yesterday", thread: [] },
    { id: "e-ref4", title: "Records request — A. Lee", from: "Insure Co", category: "Medico-legal", status: "Open", received: "Yesterday", thread: [] },
  ];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ----- render lists -----
  $("#ibRows").innerHTML = TASKS.map((t) => `
    <tr class="ib-row" data-task="${t.id}">
      <td><strong>${esc(t.title)}</strong></td><td>${esc(t.from)}</td>
      <td><span class="pill ${t.category === "Medico-legal" ? "ml" : ""}">${t.category}</span></td>
      <td><span class="pill open">${t.status}</span></td><td>${t.received}</td>
    </tr>`).join("");

  $("#caseRows").innerHTML = TASKS.filter((t) => t.category === "Medico-legal").map((t, i) => `
    <tr class="case-row" data-task="${t.id}">
      <td><strong>${esc(t.title)}</strong></td><td>${esc(t.from)}</td><td>Dr. Patel</td><td>${3 + i}/6</td>
      <td><input type="date" value="2026-10-${20 + i}" onclick="event.stopPropagation()" /></td>
      <td><select onclick="event.stopPropagation()"><option>Requested</option><option>In progress</option><option>Sent</option></select></td>
    </tr>`).join("");

  function renderEmails(dir) {
    const rows = dir === "in"
      ? TASKS.map((t) => ({ who: t.from, subj: t.title, ref: t.id }))
      : [{ who: "Front desk → Smith & Co Lawyers", subj: "RE: Report request — J. Smith", ref: "e-ref1" }];
    $("#emailRows").innerHTML = rows.map((r) => `
      <button class="email-row" data-task="${r.ref}"><strong>${esc(r.who)}</strong> · ${esc(r.subj)}
      <span class="pill" style="float:right">${r.ref.toUpperCase()}</span></button>`).join("");
  }
  renderEmails("in");

  // ----- routing: #inbox, #cases, #email, #reports, #task/<id> -----
  function route() {
    const hash = location.hash.replace(/^#/, "") || "inbox";
    const [view, id] = hash.split("/");
    if (view === "task") return showTask(id);
    showView(["inbox", "cases", "email", "reports"].includes(view) ? view : "inbox");
  }
  function showView(name) {
    $$("[data-view-panel]").forEach((p) => (p.hidden = p.dataset.viewPanel !== name));
    $$(".nav-item[data-view]").forEach((n) => n.classList.toggle("active", n.dataset.view === name || (name === "detail" && n.dataset.view === "inbox")));
    if (name !== "detail") closePanel();
    $("#newTaskModal").hidden = true; // route changes close modals, like most apps
  }
  function showTask(id) {
    const t = TASKS.find((x) => x.id === id) || TASKS[0];
    $("#dTitle").textContent = t.title;
    $("#dMeta").innerHTML = [
      ["Status", t.status], ["Priority", "Normal"], ["Category", t.category], ["Assigned to", "Front desk seat"],
      ["Working on it", "—"], ["Due", "30 Oct 2026"], ["Practice", "North"], ["Received", t.received],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
    $("#dThread").innerHTML = (t.thread.length ? t.thread : [{ from: t.from, when: t.received, text: "(original email)" }])
      .map((m) => `<div class="msg"><span class="when">${m.when}</span><div class="from">${esc(m.from)}</div><div>${esc(m.text)}</div></div>`).join("");
    showView("detail");
    setTab("task");
  }
  function setTab(name) {
    $$("#detailTabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.dtab === name));
    $$("[data-dpane]").forEach((p) => (p.hidden = p.dataset.dpane !== name));
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("popstate", route);

  // ----- interactions -----
  document.addEventListener("click", (e) => {
    const row = e.target.closest("[data-task]");
    if (row) location.hash = `#task/${row.dataset.task}`;
    const go = e.target.closest("[data-go]");
    if (go) location.hash = `#${go.dataset.go}`;
    const tab = e.target.closest("[data-dtab]");
    if (tab) setTab(tab.dataset.dtab);
    const etab = e.target.closest("[data-etab]");
    if (etab) {
      $$("[data-etab]").forEach((b) => b.classList.toggle("active", b === etab));
      renderEmails(etab.dataset.etab);
    }
  });

  const panel = $("#dQuickPanel");
  function openPanel() { panel.hidden = false; requestAnimationFrame(() => panel.classList.add("open")); }
  function closePanel() { panel.classList.remove("open"); panel.hidden = true; }
  $("#dQuickBtn").addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
  $("#qpClose").addEventListener("click", closePanel);

  const modal = $("#newTaskModal");
  $("#newTaskBtn").addEventListener("click", () => (modal.hidden = false));
  $("#ntCancel").addEventListener("click", () => (modal.hidden = true));
  modal.addEventListener("submit", (e) => { e.preventDefault(); modal.hidden = true; toast("Task created"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { modal.hidden = true; closePanel(); } });

  route();

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  // Optional, developer-side extension point: a named action tours can invoke with
  // { "type": "call", "name": "openTicket", "args": { "id": "e-ref1" } }.
  // Config can only call what the host registers here; it can never run its own code.
  window.addEventListener("guidedtour:ready", () => {
    window.Tour.registerAction("openTicket", (args) => { location.hash = `#task/${args && args.id ? args.id : "e-ref1"}`; });
  });
  window.addEventListener("guidedtour:end", (e) => console.info("[demo] tour ended", e.detail));
})();
