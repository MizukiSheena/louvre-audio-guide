const ACCESS_CODE = "louvre2026";
const ACCESS_KEY = "louvre_access_ok_v1";

const SHELL_READY_KEY = "louvre_shell_ready_v1";
const MEDIA_CACHE = "louvre-media-v1";

const state = {
  items: [],
  maps: [],
  selectedIds: new Set(),
  cacheProgress: { active: false, done: 0, total: 0, failed: [] },
  activeView: "browse",
  currentItem: null,
  cacheStatusByUrl: new Map(),
  swReady: false,
};

const el = {
  topSub: document.getElementById("topSub"),
  btnInstallHelp: document.getElementById("btnInstallHelp"),
  btnHelpOk: document.getElementById("btnHelpOk"),
  helpModal: document.getElementById("helpModal"),

  loginModal: document.getElementById("loginModal"),
  accessInput: document.getElementById("accessInput"),
  btnAccess: document.getElementById("btnAccess"),
  accessError: document.getElementById("accessError"),

  searchInput: document.getElementById("searchInput"),
  wingSelect: document.getElementById("wingSelect"),
  floorSelect: document.getElementById("floorSelect"),
  roomSelect: document.getElementById("roomSelect"),
  countText: document.getElementById("countText"),
  cards: document.getElementById("cards"),

  btnCacheAllAudio: document.getElementById("btnCacheAllAudio"),
  btnSelectAll: document.getElementById("btnSelectAll"),
  btnSelectNone: document.getElementById("btnSelectNone"),
  btnCacheSelected: document.getElementById("btnCacheSelected"),
  btnClearCache: document.getElementById("btnClearCache"),
  optIncludeImages: document.getElementById("optIncludeImages"),
  optIncludeMaps: document.getElementById("optIncludeMaps"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  downloadList: document.getElementById("downloadList"),

  mapTabs: document.getElementById("mapTabs"),
  mapImage: document.getElementById("mapImage"),

  itemModal: document.getElementById("itemModal"),
  itemTitle: document.getElementById("itemTitle"),
  itemMeta: document.getElementById("itemMeta"),
  itemImage: document.getElementById("itemImage"),
  itemAudio: document.getElementById("itemAudio"),
  btnCacheThis: document.getElementById("btnCacheThis"),
  btnDownloadThis: document.getElementById("btnDownloadThis"),
  cacheStatusPill: document.getElementById("cacheStatusPill"),
  itemHint: document.getElementById("itemHint"),
  btnCloseItem: document.getElementById("btnCloseItem"),
  transcriptWrap: document.getElementById("transcriptWrap"),
  transcriptBody: document.getElementById("transcriptBody"),
};

function setHidden(node, hidden) {
  node.classList.toggle("hidden", hidden);
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return ch;
    }
  });
}

function formatLocation(item) {
  const parts = [];
  if (item.wing) parts.push(item.wing);
  if (typeof item.floor === "number") parts.push(`${item.floor}层`);
  if (item.room) parts.push(`${item.room}展厅`);
  return parts.join(" · ");
}

function normalize(text) {
  return String(text ?? "").trim().toLowerCase();
}

function matchItem(item, query) {
  if (!query) return true;
  const hay = normalize(
    [
      item.title,
      item.wing,
      item.floor,
      item.room,
      item.audioFile,
      item.imageFile,
    ].join(" "),
  );
  return hay.includes(normalize(query));
}

function applyFilters(items) {
  const q = el.searchInput.value.trim();
  const wing = el.wingSelect.value;
  const floor = el.floorSelect.value;
  const room = el.roomSelect.value;

  return items.filter((it) => {
    if (wing && it.wing !== wing) return false;
    if (floor && String(it.floor ?? "") !== floor) return false;
    if (room && String(it.room ?? "") !== room) return false;
    return matchItem(it, q);
  });
}

function setSelectOptions(select, options, { allLabel }) {
  select.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = allLabel;
  select.appendChild(optAll);
  for (const value of options) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
}

async function canUseCaches() {
  return "caches" in window;
}

async function isUrlCached(url) {
  if (!(await canUseCaches())) return false;
  const cache = await caches.open(MEDIA_CACHE);
  const match = await cache.match(url);
  return Boolean(match);
}

async function refreshCacheBadges(items) {
  if (!(await canUseCaches())) return;
  const cache = await caches.open(MEDIA_CACHE);
  for (const it of items) {
    const url = it.audio;
    if (!url) continue;
    const cached = await cache.match(url);
    state.cacheStatusByUrl.set(url, Boolean(cached));
  }
}

function updateProgressUI() {
  const { active, done, total, failed } = state.cacheProgress;
  if (total === 0) {
    el.progressBar.style.width = "0%";
    el.progressText.textContent = "尚未开始缓存";
    return;
  }
  const pct = Math.round((done / total) * 100);
  el.progressBar.style.width = `${pct}%`;
  if (active && done < total) {
    el.progressText.textContent = `缓存中：${done}/${total}（${pct}%）`;
  } else if (done < total) {
    el.progressText.textContent = `已开始：${done}/${total}（${pct}%）`;
  } else if (failed.length > 0) {
    el.progressText.textContent = `完成：${done}/${total}，失败 ${failed.length} 个（可重试）`;
  } else {
    el.progressText.textContent = `完成：${done}/${total}`;
  }
}

function renderCards(items) {
  el.cards.innerHTML = "";
  for (const it of items) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = it.id;
    const img = document.createElement("img");
    img.className = "card__img";
    img.alt = it.title;
    img.loading = "lazy";
    img.src = it.thumb || it.image || "";
    const body = document.createElement("div");
    body.className = "card__body";
    const title = document.createElement("div");
    title.className = "card__title";
    title.textContent = it.title;
    const meta = document.createElement("div");
    meta.className = "card__meta";
    meta.textContent = formatLocation(it) || "—";
    body.appendChild(title);
    body.appendChild(meta);
    card.appendChild(img);
    card.appendChild(body);
    card.addEventListener("click", () => openItem(it));
    el.cards.appendChild(card);
  }
}

function renderDownloadList(items) {
  el.downloadList.innerHTML = "";
  for (const it of items) {
    const row = document.createElement("div");
    row.className = "dlItem";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.selectedIds.has(it.id);
    cb.addEventListener("change", () => {
      if (cb.checked) state.selectedIds.add(it.id);
      else state.selectedIds.delete(it.id);
      renderDownloadList(items);
    });

    const main = document.createElement("div");
    const title = document.createElement("div");
    title.className = "dlItem__title";
    title.textContent = it.title;
    const meta = document.createElement("div");
    meta.className = "dlItem__meta";
    meta.textContent = formatLocation(it) || "—";
    main.appendChild(title);
    main.appendChild(meta);

    const status = document.createElement("div");
    status.className = "dlItem__status";
    const cached = state.cacheStatusByUrl.get(it.audio) === true;
    status.textContent = cached ? "已缓存" : "未缓存";
    row.appendChild(cb);
    row.appendChild(main);
    row.appendChild(status);
    el.downloadList.appendChild(row);
  }
}

function showModal(modalEl) {
  setHidden(modalEl, false);
  document.body.style.overflow = "hidden";
}

function hideModal(modalEl) {
  setHidden(modalEl, true);
  document.body.style.overflow = "";
}

function setActiveView(view) {
  state.activeView = view;
  for (const sec of document.querySelectorAll(".view")) {
    setHidden(sec, sec.dataset.view !== view);
  }
  for (const btn of document.querySelectorAll(".nav__btn")) {
    btn.classList.toggle("nav__btn--active", btn.dataset.nav === view);
  }
}

function buildCacheUrlList({ items, includeImages, includeMaps, maps }) {
  const urls = [];
  for (const it of items) {
    if (it.audio) urls.push(it.audio);
    if (includeImages) {
      if (it.image) urls.push(it.image);
      if (it.thumb) urls.push(it.thumb);
    }
  }
  if (includeMaps) {
    for (const m of maps) urls.push(m.src);
  }
  return [...new Set(urls)];
}

async function cacheUrls(urls) {
  if (!navigator.serviceWorker?.controller) {
    alert("离线缓存需要 Service Worker。请刷新页面后重试。");
    return;
  }
  if (!urls.length) return;

  const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.cacheProgress = { active: true, done: 0, total: urls.length, failed: [] };
  updateProgressUI();

  navigator.serviceWorker.controller.postMessage({
    type: "CACHE_URLS",
    jobId,
    cacheName: MEDIA_CACHE,
    urls,
  });
}

async function clearMediaCache() {
  if (!(await canUseCaches())) return;
  await caches.delete(MEDIA_CACHE);
  state.cacheStatusByUrl.clear();
  await refreshCacheBadges(state.items);
  renderDownloadList(state.items);
  if (state.currentItem) await refreshItemCachePill(state.currentItem);
  alert("已清理缓存");
}

async function refreshItemCachePill(item) {
  const cached = await isUrlCached(item.audio);
  el.cacheStatusPill.textContent = cached ? "已缓存" : "未缓存";
  el.cacheStatusPill.style.borderColor = cached ? "rgba(90,167,255,0.5)" : "var(--border)";
  el.cacheStatusPill.style.color = cached ? "var(--text)" : "var(--muted)";
}

async function openItem(item) {
  state.currentItem = item;
  el.itemTitle.textContent = item.title;
  el.itemMeta.textContent = formatLocation(item) || "—";
  el.itemImage.src = item.thumb || item.image || "";
  if (item.image && item.thumb && item.image !== item.thumb) {
    const expectedId = item.id;
    const img = new Image();
    img.onload = () => {
      if (state.currentItem?.id !== expectedId) return;
      el.itemImage.src = item.image;
    };
    img.src = item.image;
  }
  el.itemAudio.src = item.audio || "";
  el.btnDownloadThis.href = item.audio || "";
  el.itemHint.textContent = item.audio
    ? "提示：若卢浮宫现场网络差，可先缓存此音频后离线播放。"
    : "未找到对应音频文件。";

  await refreshItemCachePill(item);
  await maybeLoadTranscript(item);

  showModal(el.itemModal);
}

async function maybeLoadTranscript(item) {
  el.transcriptWrap.classList.add("hidden");
  el.transcriptBody.textContent = "";
  if (!item.transcript) return;
  try {
    const resp = await fetch(item.transcript, { cache: "no-cache" });
    if (!resp.ok) return;
    const text = await resp.text();
    el.transcriptBody.innerHTML = escapeHtml(text);
    el.transcriptWrap.classList.remove("hidden");
  } catch {
    // ignore
  }
}

function wireNav() {
  for (const btn of document.querySelectorAll(".nav__btn")) {
    btn.addEventListener("click", () => {
      setActiveView(btn.dataset.nav);
      if (btn.dataset.nav === "downloads") renderDownloadList(state.items);
    });
  }
}

function wireLogin() {
  const ok = () => {
    const v = el.accessInput.value.trim();
    const good = v === ACCESS_CODE;
    setHidden(el.accessError, good);
    if (!good) return;
    localStorage.setItem(ACCESS_KEY, "1");
    hideModal(el.loginModal);
    el.topSub.textContent = "离线可用 · 建议先缓存音频再入馆";
  };

  el.btnAccess.addEventListener("click", ok);
  el.accessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") ok();
  });
}

function wireHelp() {
  el.btnInstallHelp.addEventListener("click", () => showModal(el.helpModal));
  el.btnHelpOk.addEventListener("click", () => hideModal(el.helpModal));
  el.helpModal.addEventListener("click", (e) => {
    if (e.target === el.helpModal) hideModal(el.helpModal);
  });
}

function wireItemModal() {
  el.btnCloseItem.addEventListener("click", () => {
    el.itemAudio.pause();
    hideModal(el.itemModal);
  });
  el.itemModal.addEventListener("click", (e) => {
    if (e.target === el.itemModal) {
      el.itemAudio.pause();
      hideModal(el.itemModal);
    }
  });
  el.btnCacheThis.addEventListener("click", async () => {
    if (!state.currentItem?.audio) return;
    await cacheUrls([state.currentItem.audio]);
  });
}

function wireSearchAndFilters() {
  const rerender = () => {
    const filtered = applyFilters(state.items);
    el.countText.textContent = `共 ${filtered.length} 个藏品`;
    renderCards(filtered);
  };
  el.searchInput.addEventListener("input", rerender);
  el.wingSelect.addEventListener("change", rerender);
  el.floorSelect.addEventListener("change", rerender);
  el.roomSelect.addEventListener("change", rerender);
  return rerender;
}

function wireDownloadActions() {
  el.btnSelectAll.addEventListener("click", () => {
    for (const it of state.items) state.selectedIds.add(it.id);
    renderDownloadList(state.items);
  });
  el.btnSelectNone.addEventListener("click", () => {
    state.selectedIds.clear();
    renderDownloadList(state.items);
  });

  el.btnCacheSelected.addEventListener("click", async () => {
    const selected = state.items.filter((it) => state.selectedIds.has(it.id));
    const urls = buildCacheUrlList({
      items: selected,
      includeImages: el.optIncludeImages.checked,
      includeMaps: el.optIncludeMaps.checked,
      maps: state.maps,
    });
    await cacheUrls(urls);
  });

  el.btnCacheAllAudio.addEventListener("click", async () => {
    state.selectedIds = new Set(state.items.map((it) => it.id));
    const urls = buildCacheUrlList({
      items: state.items,
      includeImages: false,
      includeMaps: true,
      maps: state.maps,
    });
    await cacheUrls(urls);
    setActiveView("downloads");
    renderDownloadList(state.items);
  });

  el.btnClearCache.addEventListener("click", async () => {
    const ok = confirm("确定要清理所有已缓存的音频/图片/地图吗？");
    if (!ok) return;
    await clearMediaCache();
  });
}

function wireMapView() {
  el.mapImage.addEventListener("click", () => {
    el.mapImage.requestFullscreen?.().catch(() => {});
  });
}

function renderMapTabs() {
  el.mapTabs.innerHTML = "";
  const buttons = [];
  for (const m of state.maps) {
    const b = document.createElement("button");
    b.className = "btn";
    b.type = "button";
    b.textContent = m.label;
    b.addEventListener("click", () => {
      for (const bb of buttons) bb.classList.remove("btn--primary");
      b.classList.add("btn--primary");
      el.mapImage.src = m.src;
    });
    buttons.push(b);
    el.mapTabs.appendChild(b);
  }
  if (buttons[0]) {
    buttons[0].classList.add("btn--primary");
    el.mapImage.src = state.maps[0].src;
  }
}

async function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    return;
  }

  navigator.serviceWorker.addEventListener("message", async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "CACHE_PROGRESS") {
      state.cacheProgress.done = msg.done;
      state.cacheProgress.total = msg.total;
      if (msg.failedUrl) state.cacheProgress.failed.push(msg.failedUrl);
      updateProgressUI();
      return;
    }

    if (msg.type === "CACHE_DONE") {
      state.cacheProgress.done = msg.total;
      state.cacheProgress.total = msg.total;
      state.cacheProgress.active = false;
      state.cacheProgress.failed = msg.failed || [];
      updateProgressUI();
      await refreshCacheBadges(state.items);
      renderDownloadList(state.items);
      if (state.currentItem) await refreshItemCachePill(state.currentItem);
      return;
    }
  });

  // Refresh controller on first load if needed.
  if (!navigator.serviceWorker.controller) {
    // Give SW a moment to take control, then reload once.
    const alreadyReloaded = sessionStorage.getItem(SHELL_READY_KEY) === "1";
    if (!alreadyReloaded) {
      sessionStorage.setItem(SHELL_READY_KEY, "1");
      setTimeout(() => location.reload(), 400);
    }
  }
}

async function loadData() {
  const [itemsResp, mapsResp] = await Promise.all([
    fetch("./data/items.json", { cache: "no-cache" }),
    fetch("./data/maps.json", { cache: "no-cache" }),
  ]);
  if (!itemsResp.ok) throw new Error("无法加载 items.json");
  if (!mapsResp.ok) throw new Error("无法加载 maps.json");
  const items = await itemsResp.json();
  const maps = await mapsResp.json();
  state.items = items;
  state.maps = maps;
}

function initFilters() {
  const wings = [...new Set(state.items.map((it) => it.wing).filter(Boolean))].sort();
  const floors = [
    ...new Set(
      state.items
        .map((it) => (typeof it.floor === "number" ? String(it.floor) : ""))
        .filter(Boolean),
    ),
  ].sort((a, b) => Number(a) - Number(b));
  const rooms = [...new Set(state.items.map((it) => it.room).filter(Boolean))]
    .map(String)
    .sort((a, b) => Number(a) - Number(b));

  setSelectOptions(el.wingSelect, wings, { allLabel: "全部" });
  setSelectOptions(el.floorSelect, floors, { allLabel: "全部" });
  setSelectOptions(el.roomSelect, rooms, { allLabel: "全部" });
}

async function main() {
  wireNav();
  wireLogin();
  wireHelp();
  wireItemModal();
  wireDownloadActions();
  wireMapView();

  const authed = localStorage.getItem(ACCESS_KEY) === "1";
  if (!authed) {
    showModal(el.loginModal);
    setTimeout(() => el.accessInput.focus(), 0);
  } else {
    el.topSub.textContent = "离线可用 · 建议先缓存音频再入馆";
  }

  await setupServiceWorker();

  try {
    await loadData();
  } catch (e) {
    el.countText.textContent = "数据加载失败，请检查 data/items.json 是否存在。";
    return;
  }

  initFilters();
  renderMapTabs();

  for (const it of state.items) state.selectedIds.add(it.id);
  await refreshCacheBadges(state.items);

  const rerender = wireSearchAndFilters();
  rerender();
  renderDownloadList(state.items);
}

main();
