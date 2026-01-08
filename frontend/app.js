const API_BASE =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:7071/api"
    : "https://cw2-functionapp-ftepf9a6hnfqbdb0.swedencentral-01.azurewebsites.net";


// ---------- helpers ----------
const qs = (id) => document.getElementById(id);

function setStatus(msg, tone = "info") {
  const prefix =
    tone === "ok" ? "✅ " :
    tone === "warn" ? "⚠️ " :
    tone === "err" ? "❌ " : "ℹ️ ";
  qs("status").textContent = prefix + msg;
}

function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

function parseTags(str) {
  if (!str) return [];
  return str.split(",").map(s => s.trim()).filter(Boolean);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Reads a File into base64 (no data: prefix)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = String(r.result || "");
      // result looks like: data:video/mp4;base64,AAAA...
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function apiFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;

  const headers = new Headers(opts.headers || {});
  // Only set JSON content-type if body is a plain object/string JSON
  // (DON'T set it for FormData / Blob)
  const isFormData = (typeof FormData !== "undefined") && (opts.body instanceof FormData);
  const hasBody = typeof opts.body !== "undefined";

  if (!isFormData && hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 204) return { ok: true, status: 204, data: null };

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  return { ok: res.ok, status: res.status, data };
}

// ---------- navigation (tabs) ----------
const tabs = Array.from(document.querySelectorAll(".tab"));
const pages = {
  list: qs("page-list"),
  upload: qs("page-upload"),
  detail: qs("page-detail"),
};

// ✅ Part 3: refresh the list automatically when returning to Home/List
async function showPage(name) {
  for (const t of tabs) t.classList.toggle("active", t.dataset.page === name);
  Object.entries(pages).forEach(([k, el]) => el.classList.toggle("active", k === name));
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Always keep homepage list up to date
  if (name === "list") {
    await loadList();
  }
}

tabs.forEach(btn => {
  btn.addEventListener("click", async () => {
    await showPage(btn.dataset.page);
  });
});

// Top refresh
qs("btnRefreshTop").addEventListener("click", () => loadList());

// ---------- LIST ----------
let allRecords = [];

function normalize(r) {
  return {
    id: r.id ?? "",
    pk: r.pk ?? "fixed",
    userId: r.userId ?? "",
    title: r.title ?? "",
    description: r.description ?? "",
    mediaType: r.mediaType ?? "",
    blobUrl: r.blobUrl ?? "",
    tags: Array.isArray(r.tags) ? r.tags : [],
    uploadDate: r.uploadDate ?? "",
  };
}

function buildMediaPreview(r) {
  const url = (r.blobUrl || "").trim();
  if (!url) {
    return `<div class="media-empty">No file uploaded</div>`;
  }

  const type = (r.mediaType || "").toLowerCase();

  if (type === "audio") {
    return `
      <audio controls preload="metadata" class="media-player">
        <source src="${escapeHtml(url)}" />
        Your browser does not support the audio element.
      </audio>
    `;
  }

  if (type === "video") {
    return `
      <video controls preload="metadata" class="media-player" playsinline>
        <source src="${escapeHtml(url)}" />
        Your browser does not support the video element.
      </video>
    `;
  }

  if (type === "image") {
    return `<img class="media-image" src="${escapeHtml(url)}" alt="media preview" />`;
  }

  return `<a class="media-link" href="${escapeHtml(url)}" target="_blank">Open file</a>`;
}

function renderCards(records) {
  const wrap = qs("cards");
  wrap.innerHTML = "";

  if (!records.length) {
    wrap.innerHTML = `<div class="panel">No records found.</div>`;
    return;
  }

  for (const raw of records) {
    const r = normalize(raw);

    const tagsHtml = (r.tags || []).slice(0, 10)
      .map(t => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("") || `<span class="tag">no-tags</span>`;

    const desc = (r.description || "").trim() || "—";
    const mediaPreview = buildMediaPreview(r);

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="card-top">
        <span class="badge">${escapeHtml(r.mediaType || "media")}</span>
        <span class="badge">${escapeHtml(r.id)}</span>
      </div>

      <h3>${escapeHtml(r.title || "(no title)")}</h3>

      <p class="meta">
        <strong>User:</strong> ${escapeHtml(r.userId || "—")}
        &nbsp; • &nbsp; <strong>Date:</strong> ${escapeHtml(r.uploadDate || "—")}
      </p>

      <div class="preview">
        ${mediaPreview}
      </div>

      <p class="desc">${escapeHtml(desc)}</p>

      <div class="tags">${tagsHtml}</div>

      <div class="card-actions">
        <button class="btn btn-primary" data-action="open" data-id="${escapeHtml(r.id)}">Open</button>
        <button class="btn btn-danger" data-action="delete" data-id="${escapeHtml(r.id)}">Delete</button>
      </div>
    `;

    wrap.appendChild(card);
  }
}

async function loadList() {
  setStatus("Loading records...");
  const { ok, status, data } = await apiFetch("/media", { method: "GET" });

  if (!ok) {
    setStatus(`Failed to load list (HTTP ${status})`, "err");
    qs("cards").innerHTML = `<pre class="result">${escapeHtml(safeJson(data))}</pre>`;
    return;
  }

  allRecords = Array.isArray(data) ? data : (data?.items ?? []);
  setStatus(`Loaded ${allRecords.length} record(s).`, "ok");
  applyFilter();
}

function applyFilter() {
  const userId = (qs("filterUserId").value || "").trim().toLowerCase();
  const view = userId
    ? allRecords.filter(r => String(r.userId || "").toLowerCase().includes(userId))
    : allRecords;

  renderCards(view);
}

qs("btnApplyFilter").addEventListener("click", applyFilter);
qs("btnClearFilter").addEventListener("click", () => {
  qs("filterUserId").value = "";
  renderCards(allRecords);
  setStatus(`Loaded ${allRecords.length} record(s).`, "ok");
});

// Card actions (open/delete)
qs("cards").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === "open") {
    qs("detailId").value = id;
    const rec = allRecords.find(r => r.id === id);
    qs("detailPk").value = (rec?.pk || "fixed");
    await loadDetail();
    await showPage("detail");
  }

  if (action === "delete") {
    const rec = allRecords.find(r => r.id === id);
    const pk = rec?.pk || "fixed";
    await deleteRecord(id, pk);
  }
});

// ---------- DETAIL (Get one + Edit + Delete) ----------
let currentDetail = null;

function renderDetailView(r) {
  const box = qs("detailView");
  if (!r) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  const tags = (r.tags || []).join(", ") || "—";

  box.classList.remove("hidden");
  box.innerHTML = `
    <h3>${escapeHtml(r.title || r.id)}</h3>
    <div class="detail-kv"><div class="detail-k">id</div><div>${escapeHtml(r.id)}</div></div>
    <div class="detail-kv"><div class="detail-k">pk</div><div>${escapeHtml(r.pk)}</div></div>
    <div class="detail-kv"><div class="detail-k">userId</div><div>${escapeHtml(r.userId || "—")}</div></div>
    <div class="detail-kv"><div class="detail-k">mediaType</div><div>${escapeHtml(r.mediaType || "—")}</div></div>
    <div class="detail-kv"><div class="detail-k">uploadDate</div><div>${escapeHtml(r.uploadDate || "—")}</div></div>
    <div class="detail-kv"><div class="detail-k">blobUrl</div><div>${r.blobUrl ? `<a href="${escapeHtml(r.blobUrl)}" target="_blank">${escapeHtml(r.blobUrl)}</a>` : "—"}</div></div>
    <div class="detail-kv"><div class="detail-k">tags</div><div>${escapeHtml(tags)}</div></div>
    <div class="detail-kv"><div class="detail-k">description</div><div>${escapeHtml(r.description || "—")}</div></div>
  `;
}

function fillEditForm(r) {
  qs("editUserId").value = r.userId || "";
  qs("editMediaType").value = r.mediaType || "audio";
  qs("editTitle").value = r.title || "";
  qs("editDescription").value = r.description || "";
  qs("editBlobUrl").value = r.blobUrl || "";
  qs("editTags").value = (r.tags || []).join(", ");
  qs("editUploadDate").value = r.uploadDate || "";
}

async function loadDetail() {
  const id = qs("detailId").value.trim();
  if (!id) return;

  setStatus(`Loading ${id}...`);
  const { ok, status, data } = await apiFetch(`/media/${encodeURIComponent(id)}`, { method: "GET" });

  if (!ok) {
    currentDetail = null;
    renderDetailView(null);
    qs("detailResult").textContent = safeJson(data);
    setStatus(`Not found (HTTP ${status})`, "err");
    return;
  }

  currentDetail = normalize(data);
  renderDetailView(currentDetail);
  fillEditForm(currentDetail);
  qs("detailResult").textContent = safeJson(currentDetail);
  setStatus(`Loaded ${id}.`, "ok");
}

qs("detailSearchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await loadDetail();
});

qs("btnDetailClear").addEventListener("click", () => {
  qs("detailId").value = "";
  qs("detailPk").value = "fixed";
  qs("detailResult").textContent = "";
  renderDetailView(null);
  currentDetail = null;
});

// PUT update
qs("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = qs("detailId").value.trim();
  const pk = (qs("detailPk").value || "fixed").trim() || "fixed";
  if (!id) return;

  const payload = {
    pk,
    userId: qs("editUserId").value.trim(),
    title: qs("editTitle").value.trim(),
    description: qs("editDescription").value.trim(),
    mediaType: qs("editMediaType").value,
    blobUrl: qs("editBlobUrl").value.trim(),
    tags: parseTags(qs("editTags").value),
    uploadDate: qs("editUploadDate").value.trim(),
  };

  setStatus(`Updating ${id}...`);
  const { ok, status, data } = await apiFetch(`/media/${encodeURIComponent(id)}?pk=${encodeURIComponent(pk)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  if (!ok) {
    qs("detailResult").textContent = safeJson(data);
    setStatus(`Update failed (HTTP ${status})`, "err");
    return;
  }

  qs("detailResult").textContent = safeJson(data);
  setStatus(`Updated ${id}.`, "ok");

  await loadList();
  await loadDetail();
});

// DELETE
async function deleteRecord(id, pk = "fixed") {
  const sure = confirm(`Delete "${id}"? This will remove the Cosmos record (and blob if your API does that).`);
  if (!sure) return;

  setStatus(`Deleting ${id}...`);
  const { ok, status, data } = await apiFetch(`/media/${encodeURIComponent(id)}?pk=${encodeURIComponent(pk)}`, {
    method: "DELETE",
  });

  if (!ok && status !== 204) {
    setStatus(`Delete failed (HTTP ${status})`, "err");
    alert(`Delete failed:\n\n${safeJson(data)}`);
    return;
  }

  setStatus(`Deleted ${id}.`, "ok");
  await loadList();

  if (qs("detailId").value.trim() === id) {
    qs("detailResult").textContent = "";
    renderDetailView(null);
    currentDetail = null;
  }
}

qs("btnDelete").addEventListener("click", async () => {
  const id = qs("detailId").value.trim();
  const pk = (qs("detailPk").value || "fixed").trim() || "fixed";
  if (!id) return;
  await deleteRecord(id, pk);
});

// ---------- UPLOAD (base64 JSON to match your mediaUpload.js) ----------
qs("btnUpClear").addEventListener("click", () => {
  qs("uploadForm").reset();
  qs("upPk").value = "fixed";
  qs("uploadResult").textContent = "";
});

qs("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  qs("uploadResult").textContent = "";

  const id = qs("upId").value.trim();
  const pk = (qs("upPk").value || "fixed").trim() || "fixed";
  const file = qs("upFile").files?.[0];

  if (!id || !file) return;

  // 1) Create metadata first (blobUrl empty for now)
  const record = {
    id,
    pk,
    userId: qs("upUserId").value.trim(),
    title: qs("upTitle").value.trim(),
    description: qs("upDescription").value.trim(),
    mediaType: qs("upMediaType").value, // "audio" or "video"
    blobUrl: "",
    tags: parseTags(qs("upTags").value),
    uploadDate: qs("upUploadDate").value.trim(),
  };

  setStatus("Creating record metadata...");
  const created = await apiFetch("/media", {
    method: "POST",
    body: JSON.stringify(record),
  });

  if (!created.ok) {
    setStatus(`Create failed (HTTP ${created.status})`, "err");
    qs("uploadResult").textContent = safeJson(created.data);
    return;
  }

  // 2) Upload file as base64 JSON (matches your mediaUpload.js)
  setStatus("Uploading file...");

  // ✅ THIS IS THE CORRECT PLACE (added here):
  const base64 = await fileToBase64(file);

  const uploadPayload = {
    pk,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    fileBase64: base64,
  };

  const uploaded = await apiFetch(`/media/${encodeURIComponent(id)}/file`, {
    method: "POST",
    body: JSON.stringify(uploadPayload),
  });

  if (!uploaded.ok && uploaded.status !== 204) {
    setStatus(`Upload failed (HTTP ${uploaded.status})`, "err");
    qs("uploadResult").textContent =
      "Created metadata:\n" + safeJson(created.data) +
      "\n\nUpload error:\n" + safeJson(uploaded.data);
    return;
  }

  // Try to extract blobUrl from upload response
  let blobUrl =
    uploaded?.data?.blobUrl ||
    uploaded?.data?.url ||
    uploaded?.data?.fileUrl ||
    uploaded?.data?.resource?.blobUrl ||
    null;

  // If we got a blobUrl, do a fallback PUT update (in case backend didn't persist for some reason)
  if (blobUrl) {
    setStatus("Upload complete. Ensuring blobUrl is saved...");
    const patch = await apiFetch(`/media/${encodeURIComponent(id)}?pk=${encodeURIComponent(pk)}`, {
      method: "PUT",
      body: JSON.stringify({ blobUrl }),
    });

    // If PUT fails, we still continue (since your upload endpoint already upserts)
    if (!patch.ok) {
      setStatus(`Upload ok but PUT blobUrl failed (HTTP ${patch.status})`, "warn");
    }
  }

  setStatus("Upload complete. Refreshing list...", "ok");
  qs("uploadResult").textContent =
    "Created metadata:\n" + safeJson(created.data) +
    "\n\nUpload response:\n" + safeJson(uploaded.data) +
    (blobUrl ? `\n\nblobUrl:\n${blobUrl}` : "\n\n(No blobUrl returned from upload endpoint)");

  await loadList();

  // Jump to detail page
  qs("detailId").value = id;
  qs("detailPk").value = pk;
  await loadDetail();
  await showPage("detail");
});

// ---------- init ----------
loadList();
