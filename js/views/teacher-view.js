import { isSameDay, UserRole, escapeHtml, AnnouncementStatus } from "../models.js";
import {
  watchApproved,
  watchManageableBy,
  requestDelete,
  approveAnnouncement,
  rejectAnnouncement,
  confirmDelete,
} from "../announcement-service.js";
import { watchAppUser, addStudent } from "../auth-service.js";
import { renderCalendar } from "../calendar.js";
import { showDaySheet } from "../day-sheet.js";
import { createAnnouncementCard } from "../announcement-card.js";
import { openAnnouncementForm } from "../announcement-form.js";
import { renderProfileTab } from "./profile-view.js";
import { emptyFilter, filterAnnouncements, mountFilterBar } from "../announcement-filter.js";

export function renderTeacherView(container, user) {
  let tab = 0;
  let focusedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const unsubs = [];
  const filter = emptyFilter();

  container.innerHTML = `
    <div class="topbar"><h1>Guru · ${escapeHtml(user.name)}</h1></div>
    <div class="dash-body" id="dash-body"></div>
    <div class="bottom-nav">
      <button class="nav-btn active" data-tab="0"><span class="nav-icon">🗓️</span>Kalender</button>
      <button class="nav-btn" data-tab="1"><span class="nav-icon">📋</span>Kelola</button>
      <button class="nav-btn" data-tab="2"><span class="nav-icon">🎓</span>Murid Saya</button>
      <button class="nav-btn" data-tab="3"><span class="nav-icon">👤</span>Profil</button>
    </div>`;

  const body = container.querySelector("#dash-body");
  const navBtns = container.querySelectorAll(".nav-btn");

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tab = parseInt(btn.dataset.tab, 10);
      navBtns.forEach((b) => b.classList.toggle("active", b === btn));
      draw();
    });
  });

  function drawCalendarTab() {
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

  function drawManageTab() {
    body.innerHTML = `<div id="manage-list"></div>`;
    const list = body.querySelector("#manage-list");
    const unsub = watchManageableBy(user, (items) => {
      if (items.length === 0) {
        list.innerHTML = `<p class="empty-msg">Belum ada pengumuman dari Anda atau murid Anda.</p>`;
        return;
      }
      list.innerHTML = "";
      items.forEach((a) => {
        const isStudentAuthored = a.authorRole === UserRole.STUDENT;
        list.appendChild(
          createAnnouncementCard(a, {
            canEdit: true,
            canApprove: isStudentAuthored,
            onEdit: () => openAnnouncementForm({ currentUser: user, initialDate: a.date, existing: a }),
            onDelete: () => requestDelete({ requester: user, target: a }),
            onApprove: () =>
              a.status === AnnouncementStatus.PENDING_DELETE
                ? confirmDelete({ approver: user, target: a })
                : approveAnnouncement({ approver: user, target: a }),
            onReject: () => rejectAnnouncement({ approver: user, target: a }),
          })
        );
      });
    });
    unsubs.push(unsub);
  }

  function drawMyStudentTab() {
    body.innerHTML = `<div id="student-slot"></div>`;
    const slot = body.querySelector("#student-slot");
    const unsub = watchAppUser(user.uid, (liveUser) => {
      if (!liveUser || !liveUser.studentId) {
        slot.innerHTML = "";
        slot.appendChild(buildAddStudentForm(liveUser || user));
        return;
      }
      const unsub2 = watchAppUser(liveUser.studentId, (student) => {
        slot.innerHTML = `
          <div class="parchment-panel">
            <h3 style="margin-top:0;">Murid yang Anda tambahkan</h3>
            <hr style="border-color:var(--wood-mid)"/>
            ${
              student
                ? `<p>Nama: ${escapeHtml(student.name)}</p><p>Email: ${escapeHtml(student.email)}</p>`
                : `<p>Data murid tidak ditemukan.</p>`
            }
            <p style="font-size:15px;color:var(--wood-dark)">Setiap akun guru hanya boleh menambahkan maksimal 1 murid, jadi slot Anda sudah terisi.</p>
          </div>`;
      });
      unsubs.push(unsub2);
    });
    unsubs.push(unsub);
  }

  function buildAddStudentForm(teacher) {
    const wrap = document.createElement("div");
    wrap.className = "parchment-panel";
    wrap.innerHTML = `
      <h3 style="margin-top:0;">Tambah 1 Akun Murid</h3>
      <p>Anda belum memiliki murid. Setiap guru hanya boleh menambahkan maksimal 1 murid per akun.</p>
      <form id="add-student-form">
        <div class="form-group"><label>Nama Murid</label><input type="text" name="name" required /></div>
        <div class="form-group"><label>Email Murid</label><input type="email" name="email" required /></div>
        <div class="form-group"><label>Kata Sandi Awal</label><input type="password" name="password" minlength="6" required /></div>
        <div class="form-error" style="display:none"></div>
        <button type="submit" class="wood-btn success">👤 Tambah Murid</button>
      </form>`;
    const form = wrap.querySelector("#add-student-form");
    const errorBox = wrap.querySelector(".form-error");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.style.display = "none";
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Menyimpan...";
      try {
        const fd = new FormData(form);
        await addStudent({
          name: fd.get("name").trim(),
          email: fd.get("email").trim(),
          password: fd.get("password"),
          teacher,
        });
        form.reset();
        alert("Akun murid berhasil dibuat!");
      } catch (err) {
        errorBox.textContent = err.message || String(err);
        errorBox.style.display = "block";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "👤 Tambah Murid";
      }
    });
    return wrap;
  }

  function drawProfileTab() {
    renderProfileTab(body, user);
  }

  function clearSubs() {
    while (unsubs.length) unsubs.pop()?.();
  }

  function draw() {
    clearSubs();
    if (tab === 0) drawCalendarTab();
    else if (tab === 1) drawManageTab();
    else if (tab === 2) drawMyStudentTab();
    else drawProfileTab();
  }

  draw();
  container._cleanup = clearSubs;
}
