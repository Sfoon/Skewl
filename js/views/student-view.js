import { isSameDay, escapeHtml } from "../models.js";
import { watchApproved, watchManageableBy, requestDelete } from "../announcement-service.js";
import { renderCalendar } from "../calendar.js";
import { showDaySheet } from "../day-sheet.js";
import { createAnnouncementCard } from "../announcement-card.js";
import { openAnnouncementForm } from "../announcement-form.js";
import { renderProfileTab } from "./profile-view.js";
import { emptyFilter, filterAnnouncements, mountFilterBar } from "../announcement-filter.js";

export function renderStudentView(container, user) {
  let tab = 0;
  let focusedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const unsubs = [];
  const filter = emptyFilter();

  container.innerHTML = `
    <div class="topbar"><h1>Murid · ${escapeHtml(user.name)}</h1></div>
    <div class="dash-body" id="dash-body"></div>
    <button class="fab" id="fab-add" style="display:none">+</button>
    <div class="bottom-nav">
      <button class="nav-btn active" data-tab="0"><span class="nav-icon">🗓️</span>Kalender</button>
      <button class="nav-btn" data-tab="1"><span class="nav-icon">📣</span>Pengumuman Saya</button>
      <button class="nav-btn" data-tab="2"><span class="nav-icon">👤</span>Profil</button>
    </div>`;

  const body = container.querySelector("#dash-body");
  const fab = container.querySelector("#fab-add");
  const navBtns = container.querySelectorAll(".nav-btn");

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tab = parseInt(btn.dataset.tab, 10);
      navBtns.forEach((b) => b.classList.toggle("active", b === btn));
      draw();
    });
  });

  fab.addEventListener("click", () => {
    openAnnouncementForm({ currentUser: user, initialDate: new Date() });
  });

  function drawCalendarTab() {
    fab.style.display = "none";
    body.innerHTML = `<div id="filter-slot"></div><div class="wood-panel" id="cal-slot"></div>`;
    const slot = body.querySelector("#cal-slot");
    let all = [];
    const paint = () => {
      const list = filterAnnouncements(all, filter);
      renderCalendar(slot, {
        focusedMonth,
        announcements: list,
        onMonthChange: (m) => {
          focusedMonth = m;
          drawCalendarTab();
        },
        onDayTap: (date) => {
          const events = list.filter((a) => isSameDay(a.date, date));
          showDaySheet({ date, dayAnnouncements: events, currentUser: user });
        },
      });
    };
    mountFilterBar(body.querySelector("#filter-slot"), filter, paint);
    const unsub = watchApproved((list) => {
      all = list;
      paint();
    });
    unsubs.push(unsub);
  }

  function drawMyAnnouncementsTab() {
    fab.style.display = "block";
    body.innerHTML = `<div id="my-ann-list"></div>`;
    const list = body.querySelector("#my-ann-list");
    const unsub = watchManageableBy(user, (items) => {
      if (items.length === 0) {
        list.innerHTML = `<p class="empty-msg">Anda belum membuat pengumuman apa pun.</p>`;
        return;
      }
      list.innerHTML = "";
      items.forEach((a) => {
        list.appendChild(
          createAnnouncementCard(a, {
            canEdit: true,
            onEdit: () => openAnnouncementForm({ currentUser: user, initialDate: a.date, existing: a }),
            onDelete: () => requestDelete({ requester: user, target: a }),
          })
        );
      });
    });
    unsubs.push(unsub);
  }

  function drawProfileTab() {
    fab.style.display = "none";
    renderProfileTab(body, user);
  }

  function clearSubs() {
    while (unsubs.length) unsubs.pop()?.();
  }

  function draw() {
    clearSubs();
    if (tab === 0) drawCalendarTab();
    else if (tab === 1) drawMyAnnouncementsTab();
    else drawProfileTab();
  }

  draw();
  container._cleanup = clearSubs;
}
