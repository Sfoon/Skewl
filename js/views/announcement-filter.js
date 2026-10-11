import { AnnouncementCategory, TargetAudience, categoryLabel, targetLabel, escapeHtml } from "./models.js";

/**
 * Status filter satu view. Objek ini dipegang oleh view (bukan oleh bilahnya)
 * supaya pencarian tetap utuh saat pindah bulan / pindah tab.
 * category & target: "" = tanpa filter. open: bilah sedang terbuka.
 */
export function emptyFilter() {
  return { text: "", category: "", target: "", open: false };
}

export function isFilterActive(f) {
  return Boolean(f.text.trim() || f.category || f.target);
}

/** Cari di judul + isi (tanpa peka huruf besar/kecil); kategori & target cocok persis. */
export function filterAnnouncements(list, f) {
  const q = f.text.trim().toLowerCase();
  if (!q && !f.category && !f.target) return list;
  return list.filter(
    (a) =>
      (!f.category || a.category === f.category) &&
      (!f.target || a.target === f.target) &&
      (!q || a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q))
  );
}

// Filter SVG "gooey": membuat tetesan & genangan menyatu seperti cairan.
function ensureGooFilter() {
  if (document.getElementById("fbar-goo-svg")) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<svg id="fbar-goo-svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      <filter id="fbar-goo">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>
        <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>
        <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
      </filter></defs></svg>`
  );
}

/**
 * Menggambar bilah cari + filter (livery "Grello") ke dalam `container`.
 * Mengubah `filter` langsung, lalu memanggil onChange() setiap ada perubahan.
 * Gaya & animasi tetesan ada di style.css (bagian ".fbar").
 */
export function mountFilterBar(container, filter, onChange) {
  ensureGooFilter();
  const options = (values, label) => values.map((v) => `<option value="${v}">${label(v)}</option>`).join("");

  container.innerHTML = `
    <div class="fbar">
      <button type="button" class="fbar-toggle" aria-expanded="${filter.open}">
        <span>🔍 Cari &amp; Filter</span><span class="fbar-dot" title="Filter aktif"></span>
      </button>
      <div class="fbar-reveal"><div class="fbar-inner">
        <div class="fbar-goo" aria-hidden="true"><i class="fbar-pool"></i><i class="fbar-stream"></i><i class="fbar-drop"></i></div>
        <div class="fbar-panel">
          <input type="search" class="fbar-input" placeholder="Cari judul atau isi..." aria-label="Cari pengumuman" value="${escapeHtml(filter.text)}" />
          <div class="fbar-row">
            <select class="fbar-select" data-key="category" aria-label="Filter kategori">
              <option value="">Semua kategori</option>${options(Object.values(AnnouncementCategory), categoryLabel)}
            </select>
            <select class="fbar-select" data-key="target" aria-label="Filter target pembaca">
              <option value="">Semua target</option>${options(Object.values(TargetAudience), (t) => `Untuk ${targetLabel(t).toLowerCase()}`)}
            </select>
          </div>
        </div>
      </div></div>
    </div>`;

  const bar = container.querySelector(".fbar");
  const toggle = bar.querySelector(".fbar-toggle");
  const input = bar.querySelector(".fbar-input");
  const selects = bar.querySelectorAll(".fbar-select");

  // Saat dipasang ulang (mis. ganti bulan) bilah langsung tampil apa adanya, tanpa tetesan.
  bar.classList.toggle("open", filter.open);
  selects.forEach((s) => (s.value = filter[s.dataset.key]));
  const syncActive = () => bar.classList.toggle("active", isFilterActive(filter));
  syncActive();

  toggle.addEventListener("click", () => {
    filter.open = !filter.open;
    toggle.setAttribute("aria-expanded", String(filter.open));
    bar.classList.remove("dripping");
    if (filter.open) {
      void bar.offsetWidth; // mulai ulang animasi tetesan
      bar.classList.add("dripping");
      setTimeout(() => filter.open && input.focus({ preventScroll: true }), 700);
    }
    bar.classList.toggle("open", filter.open);
  });

  const changed = () => {
    syncActive();
    onChange();
  };
  input.addEventListener("input", () => {
    filter.text = input.value;
    changed();
  });
  selects.forEach((s) =>
    s.addEventListener("change", () => {
      filter[s.dataset.key] = s.value;
      changed();
    })
  );
}
