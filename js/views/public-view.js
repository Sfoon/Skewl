import { categoryLabel, categoryColor, AnnouncementStatus, TargetAudience, escapeHtml, seasonForMonth, isSameDay } from "../models.js";
import { watchApproved } from "../announcement-service.js";
import { renderCalendar } from "../calendar.js";
import { showDaySheet } from "../day-sheet.js";
import { emptyFilter, filterAnnouncements, mountFilterBar } from "../announcement-filter.js";

const LOGO_URL = "https://ugc.production.linktr.ee/4btAu48R9qoHS6tpuI0J_D7osonk2FBBtpmoE?io=true&size=avatar-v3_0";

export function renderPublicView(container, { onLoginClick } = {}) {
  let page = "home";
  let focusedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let allAnnouncements = [];
  let unsub = null;
  const filter = emptyFilter();

  container.innerHTML = `
    <div class="topbar brand-bar">
      <div class="brand-lockup"><img src="${LOGO_URL}" alt="Logo SMK YASBAM" class="school-logo"/><h1>SMK YASBAM</h1></div>
      <button class="wood-btn ghost small" id="login-btn">🔑 Masuk</button>
    </div>
    <div class="dash-body public-body" id="public-body"></div>`;

  container.querySelector("#login-btn").addEventListener("click", () => onLoginClick?.());
  const body = container.querySelector("#public-body");

  function drawHome() {
    page = "home";
    const important = allAnnouncements
      .filter((a) => a.status === AnnouncementStatus.APPROVED && a.category === "penting" && a.target === TargetAudience.SEMUA)
      .sort((a, b) => b.date - a.date)
      .slice(0, 5);
    const latest = allAnnouncements
      .filter((a) => a.status === AnnouncementStatus.APPROVED && a.target === TargetAudience.SEMUA)
      .sort((a, b) => b.date - a.date)
      .slice(0, 6);

    body.innerHTML = `
      <section class="hero-home parchment-panel">
        <img src="${LOGO_URL}" alt="Logo SMK YASBAM" class="hero-logo"/>
        <h2>Selamat Datang di SMK YASBAM</h2>
        <p>Pusat pengumuman resmi sekolah. Temukan informasi utama terlebih dahulu, lalu buka kalender untuk melihat agenda berdasarkan tanggal.</p>
      </section>
      <section class="home-section">
        <div class="section-heading"><h3>📌 Pengumuman Utama</h3><span class="section-note">Prioritas sekolah</span></div>
        <div id="important-list" class="announcement-list"></div>
      </section>
      <section class="home-section">
        <div class="section-heading"><h3>📣 Pengumuman Terbaru</h3><span class="section-note">Untuk semua</span></div>
        <div id="latest-list" class="announcement-list"></div>
      </section>
      <section class="contact-panel parchment-panel">
        <h3>Kontak SMK YASBAM</h3>
        <p>📞 0251-8292474</p><p>✉ yasbam44@yahoo.com</p><p>🌐 smkyasbam.sch.id</p>
      </section>
      <div class="home-actions"><button class="wood-btn success" id="open-calendar">🗓️ Buka Kalender Pengumuman</button><button class="wood-btn" id="login-btn-2">🔑 Masuk sebagai Guru / Murid / Admin</button></div>`;

    renderAnnouncementList(body.querySelector("#important-list"), important, "Belum ada pengumuman utama.");
    renderAnnouncementList(body.querySelector("#latest-list"), latest, "Belum ada pengumuman terbaru.");
    body.querySelector("#open-calendar").addEventListener("click", drawCalendar);
    body.querySelector("#login-btn-2").addEventListener("click", () => onLoginClick?.());
  }

  function renderAnnouncementList(target, list, emptyText) {
    if (!list.length) { target.innerHTML = `<p class="empty-msg">${emptyText}</p>`; return; }
    target.innerHTML = list.map((a) => `
      <article class="home-announcement parchment-panel">
        <span class="badge" style="background:${categoryColor(a.category)}">${categoryLabel(a.category)}</span>
        <h4>${escapeHtml(a.title)}</h4>
        <p>${escapeHtml(a.content)}</p>
        <small>${a.date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</small>
      </article>`).join("");
  }

  function drawCalendar() {
    page = "calendar";
    const season = seasonForMonth(focusedMonth.getMonth());
    body.innerHTML = `
      <div class="calendar-page-head"><button class="wood-btn ghost small" id="back-home">← Beranda</button><div><h2>Kalender Pengumuman</h2><p>${season.emoji} ${season.label}</p></div></div>
      <div id="filter-slot"></div>
      <div id="calendar-slot" class="wood-panel"></div>
      <div class="calendar-contact parchment-panel"><strong>Kontak SMK YASBAM</strong><div>0251-8292474 · yasbam44@yahoo.com</div></div>`;
    body.querySelector("#back-home").addEventListener("click", drawHome);
    const slot = body.querySelector("#calendar-slot");
    const paint = () => {
      const visible = filterAnnouncements(allAnnouncements, filter);
      renderCalendar(slot, {
        focusedMonth,
        announcements: visible,
        onMonthChange: (m) => { focusedMonth = m; drawCalendar(); },
        onDayTap: (date) => {
          const events = visible.filter((a) => isSameDay(a.date, date));
          showDaySheet({ date, dayAnnouncements: events, currentUser: null });
        },
      });
    };
    mountFilterBar(body.querySelector("#filter-slot"), filter, paint);
    paint();
  }

  drawHome();
  unsub = watchApproved((list) => { allAnnouncements = list; if (page === "home") drawHome(); else drawCalendar(); });
  container._cleanup = () => unsub?.();
}
