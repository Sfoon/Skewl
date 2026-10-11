import { isSameDay, UserRole, roleLabel, escapeHtml, AnnouncementStatus } from "../models.js";
import {
  watchApproved,
  watchManageableBy,
  approveAnnouncement,
  rejectAnnouncement,
  confirmDelete,
  adminForceDelete,
  watchAuditLogs,
  AuditAction,
} from "../announcement-service.js";
import { adminCreateTeacher } from "../auth-service.js";
import { watchAllUsers, deleteUserProfile } from "../user-service.js";
import { renderCalendar } from "../calendar.js";
import { showDaySheet } from "../day-sheet.js";
import { createAnnouncementCard } from "../announcement-card.js";
import { openAnnouncementForm } from "../announcement-form.js";
import { renderProfileTab } from "./profile-view.js";

export function renderAdminView(container, user) {
  let tab = 0;
  let focusedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const unsubs = [];

  container.innerHTML = `
    <div class="topbar"><h1>Admin · ${escapeHtml(user.name)}</h1></div>
    <div class="dash-body" id="dash-body"></div>
    <div class="bottom-nav">
      <button class="nav-btn active" data-tab="0"><span class="nav-icon">🗓️</span>Kalender</button>
      <button class="nav-btn" data-tab="1"><span class="nav-icon">📋</span>Semua Pengumuman</button>
      <button class="nav-btn" data-tab="2"><span class="nav-icon">👥</span>Kelola Pengguna</button>
      <button class="nav-btn" data-tab="3"><span class="nav-icon">🕘</span>Riwayat</button>
      <button class="nav-btn" data-tab="4"><span class="nav-icon">👤</span>Profil</button>
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
    body.innerHTML = `<div class="wood-panel" id="cal-slot"></div>`;
    const slot = body.querySelector("#cal-slot");
    const unsub = watchApproved((list) => {
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
    });
    unsubs.push(unsub);
  }

  function drawAllAnnouncementsTab() {
    body.innerHTML = `<div id="all-ann-list"></div>`;
    const list = body.querySelector("#all-ann-list");
    const unsub = watchManageableBy(user, (items) => {
      if (items.length === 0) {
        list.innerHTML = `<p class="empty-msg">Belum ada pengumuman.</p>`;
        return;
      }
      list.innerHTML = "";
      items.forEach((a) => {
        list.appendChild(
          createAnnouncementCard(a, {
            canEdit: true,
            canApprove: a.authorRole !== UserRole.ADMIN,
            onEdit: () => openAnnouncementForm({ currentUser: user, initialDate: a.date, existing: a }),
            onDelete: () => adminForceDelete(a, user),
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

  const AUDIT_LABEL = {
    [AuditAction.APPROVE]: "menyetujui",
    [AuditAction.REJECT]: "menolak",
    [AuditAction.CONFIRM_DELETE]: "mengonfirmasi hapus",
    [AuditAction.CREATE]: "membuat (langsung disetujui)",
    [AuditAction.UPDATE]: "mengedit (langsung disetujui)",
    [AuditAction.FORCE_DELETE]: "menghapus paksa",
  };

  function drawAuditTab() {
    body.innerHTML = `<div id="audit-list"></div>`;
    const list = body.querySelector("#audit-list");
    const unsub = watchAuditLogs((logs) => {
      if (logs.length === 0) {
        list.innerHTML = `<p class="empty-msg">Belum ada riwayat persetujuan.</p>`;
        return;
      }
      list.innerHTML = "";
      logs.forEach((l) => {
        const row = document.createElement("div");
        row.className = "user-row";
        row.innerHTML = `
          <div>
            <div class="name">${escapeHtml(l.actorName)} (${roleLabel(l.actorRole)}) ${AUDIT_LABEL[l.action] ?? escapeHtml(l.action)}</div>
            <div class="meta">"${escapeHtml(l.announcementTitle)}" · ${l.createdAt.toLocaleString("id-ID")}</div>
          </div>`;
        list.appendChild(row);
      });
    });
    unsubs.push(unsub);
  }

  function drawManageUsersTab() {
    body.innerHTML = `
      <button class="wood-btn success" id="add-teacher-btn" style="margin-bottom:12px;">➕ Tambah Akun Guru</button>
      <div id="user-list"></div>`;
    body.querySelector("#add-teacher-btn").addEventListener("click", openAddTeacherDialog);

    const listEl = body.querySelector("#user-list");
    const unsub = watchAllUsers((users) => {
      listEl.innerHTML = "";
      users.forEach((u) => {
        const row = document.createElement("div");
        row.className = "user-row";
        row.innerHTML = `
          <div>
            <div class="name">${escapeHtml(u.name)}</div>
            <div class="meta">${escapeHtml(u.email)} · ${roleLabel(u.role)}</div>
          </div>
          ${u.uid !== user.uid ? `<button class="icon-btn" title="Hapus akun">🗑️</button>` : ""}`;
        if (u.uid !== user.uid) {
          row.querySelector(".icon-btn").addEventListener("click", () => confirmDeleteUser(u));
        }
        listEl.appendChild(row);
      });
    });
    unsubs.push(unsub);
  }

  function confirmDeleteUser(u) {
    const ok = confirm(`Profil "${u.name}" (${roleLabel(u.role)}) akan dihapus dari sistem. Lanjutkan?`);
    if (ok) deleteUserProfile(u);
  }

  function openAddTeacherDialog() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Tambah Akun Guru</h3>
        <form id="add-teacher-form">
          <div class="form-group"><label>Nama Guru</label><input type="text" name="name" required /></div>
          <div class="form-group"><label>Email</label><input type="email" name="email" required /></div>
          <div class="form-group"><label>Kata Sandi Awal</label><input type="password" name="password" minlength="6" required /></div>
          <div class="form-error" style="display:none"></div>
          <div class="modal-actions">
            <button type="button" class="wood-btn ghost" data-close>Batal</button>
            <button type="submit" class="wood-btn success">Simpan</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector("[data-close]").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    const form = overlay.querySelector("#add-teacher-form");
    const errorBox = overlay.querySelector(".form-error");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.style.display = "none";
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Menyimpan...";
      try {
        const fd = new FormData(form);
        await adminCreateTeacher({
          name: fd.get("name").trim(),
          email: fd.get("email").trim(),
          password: fd.get("password"),
          adminUid: user.uid,
        });
        close();
      } catch (err) {
        errorBox.textContent = err.message || String(err);
        errorBox.style.display = "block";
        submitBtn.disabled = false;
        submitBtn.textContent = "Simpan";
      }
    });
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
    else if (tab === 1) drawAllAnnouncementsTab();
    else if (tab === 2) drawManageUsersTab();
    else if (tab === 3) drawAuditTab();
    else drawProfileTab();
  }

  draw();
  container._cleanup = clearSubs;
}
