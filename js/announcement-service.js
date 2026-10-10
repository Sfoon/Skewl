import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { Announcement, AnnouncementStatus } from "./models.js";

const col = collection(db, "announcements");
const auditCol = collection(db, "auditLogs");

/** Aksi yang dicatat di audit trail. */
export const AuditAction = {
  APPROVE: "approve",
  REJECT: "reject",
  CONFIRM_DELETE: "confirmDelete",
  CREATE: "create", // guru/admin membuat -> langsung disetujui
  UPDATE: "update", // guru/admin mengedit -> langsung disetujui
  FORCE_DELETE: "forceDelete", // admin hapus tanpa antrean
};

/**
 * Menambahkan satu catatan audit ke batch. Judul & status disalin ke log
 * karena dokumen pengumuman bisa saja dihapus (confirmDelete), sedangkan
 * log harus tetap ada.
 */
function addAuditLog(batch, { actor, action, target, newStatus }) {
  batch.set(doc(auditCol), {
    action,
    announcementId: target.id,
    announcementTitle: target.title,
    prevStatus: target.status,
    newStatus,
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    createdAt: serverTimestamp(),
  });
}

/** Admin: 100 catatan audit terbaru. */
export function watchAuditLogs(callback) {
  const q = query(auditCol, orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(q, (snap) =>
    callback(
      snap.docs.map((d) => {
        const data = d.data({ serverTimestamps: "estimate" });
        return { id: d.id, ...data, createdAt: data.createdAt.toDate() };
      })
    )
  );
}

/** Kalender PUBLIK: hanya pengumuman yang sudah disetujui. */
export function watchApproved(callback) {
  const q = query(col, where("status", "==", AnnouncementStatus.APPROVED), orderBy("date"));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => Announcement.fromDoc(d))));
}

/**
 * Panel "Pengumuman Saya": semua status milik akun yang login, dan — khusus
 * guru — juga milik satu murid yang ia tambahkan. Admin melihat semuanya.
 */
export function watchManageableBy(user, callback) {
  if (user.isAdmin) {
    const q = query(col, orderBy("date"));
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => Announcement.fromDoc(d))));
  }
  if (user.isTeacher) {
    const ids = user.studentId ? [user.uid, user.studentId] : [user.uid];
    const q = query(col, where("authorId", "in", ids));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => Announcement.fromDoc(d));
      list.sort((a, b) => a.date - b.date);
      callback(list);
    });
  }
  // murid
  const q = query(col, where("authorId", "==", user.uid));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => Announcement.fromDoc(d));
    list.sort((a, b) => a.date - b.date);
    callback(list);
  });
}

function canManage(user, a) {
  return user.canManageAuthoredBy(a.authorId, a.authorRole);
}

/**
 * Membuat pengumuman baru. Status otomatis:
 * - Guru/Admin -> langsung 'approved' (mereka sendiri penyetuju).
 * - Murid -> 'pending', menunggu guru/admin.
 */
export async function createAnnouncement({ author, title, content, date, category, target }) {
  const now = new Date();
  const isSelfApproving = author.isAdmin || author.isTeacher;
  const data = {
    title,
    content,
    date,
    category,
    target,
    authorId: author.uid,
    authorName: author.name,
    authorRole: author.role,
    status: isSelfApproving ? AnnouncementStatus.APPROVED : AnnouncementStatus.PENDING,
    approvedBy: isSelfApproving ? author.uid : null,
    createdAt: now,
    updatedAt: now,
  };
  if (!isSelfApproving) {
    await addDoc(col, data);
    return;
  }
  const ref = doc(col);
  const batch = writeBatch(db);
  batch.set(ref, data);
  addAuditLog(batch, {
    actor: author,
    action: AuditAction.CREATE,
    target: { id: ref.id, title, status: null },
    newStatus: AnnouncementStatus.APPROVED,
  });
  await batch.commit();
}

/**
 * Mengedit pengumuman. Jika yang mengedit MURID, hasilnya kembali
 * berstatus 'pending' (harus disetujui ulang).
 */
export async function updateAnnouncement({ editor, original, title, content, date, category, target }) {
  if (!canManage(editor, original)) throw new Error("Anda tidak berhak mengubah pengumuman ini.");
  const needsReapproval = editor.isStudent;
  const batch = writeBatch(db);
  batch.update(doc(db, "announcements", original.id), {
    title,
    content,
    date,
    category,
    target,
    status: needsReapproval ? AnnouncementStatus.PENDING : AnnouncementStatus.APPROVED,
    approvedBy: needsReapproval ? null : editor.uid,
    updatedAt: new Date(),
  });
  if (!needsReapproval) {
    addAuditLog(batch, {
      actor: editor,
      action: AuditAction.UPDATE,
      target: { id: original.id, title, status: original.status },
      newStatus: AnnouncementStatus.APPROVED,
    });
  }
  await batch.commit();
}

/**
 * Menghapus pengumuman.
 * - Guru/Admin: hapus langsung (mereka penyetuju).
 * - Murid: TIDAK langsung terhapus, hanya ditandai 'pendingDelete' agar
 *   guru/admin bisa mengonfirmasi.
 */
export async function requestDelete({ requester, target }) {
  if (!canManage(requester, target)) throw new Error("Anda tidak berhak menghapus pengumuman ini.");
  if (requester.isAdmin || requester.isTeacher) {
    await deleteDoc(doc(db, "announcements", target.id));
  } else {
    await updateDoc(doc(db, "announcements", target.id), {
      status: AnnouncementStatus.PENDING_DELETE,
      updatedAt: new Date(),
    });
  }
}

/** Guru/Admin menyetujui pengumuman murid yang berstatus pending. */
export async function approveAnnouncement({ approver, target }) {
  if (!canManage(approver, target)) throw new Error("Anda tidak berhak menyetujui pengumuman ini.");
  const batch = writeBatch(db);
  batch.update(doc(db, "announcements", target.id), {
    status: AnnouncementStatus.APPROVED,
    approvedBy: approver.uid,
    updatedAt: new Date(),
  });
  addAuditLog(batch, {
    actor: approver,
    action: AuditAction.APPROVE,
    target,
    newStatus: AnnouncementStatus.APPROVED,
  });
  await batch.commit();
}

/** Guru/Admin menolak pengumuman murid yang berstatus pending. */
export async function rejectAnnouncement({ approver, target }) {
  if (!canManage(approver, target)) throw new Error("Anda tidak berhak menolak pengumuman ini.");
  const batch = writeBatch(db);
  batch.update(doc(db, "announcements", target.id), {
    status: AnnouncementStatus.REJECTED,
    approvedBy: approver.uid,
    updatedAt: new Date(),
  });
  addAuditLog(batch, {
    actor: approver,
    action: AuditAction.REJECT,
    target,
    newStatus: AnnouncementStatus.REJECTED,
  });
  await batch.commit();
}

/** Guru/Admin mengonfirmasi permintaan hapus dari murid -> hapus permanen. */
export async function confirmDelete({ approver, target }) {
  if (!canManage(approver, target)) throw new Error("Anda tidak berhak mengonfirmasi penghapusan ini.");
  const batch = writeBatch(db);
  batch.delete(doc(db, "announcements", target.id));
  addAuditLog(batch, {
    actor: approver,
    action: AuditAction.CONFIRM_DELETE,
    target,
    newStatus: null,
  });
  await batch.commit();
}

/** Admin: hapus pengumuman siapa pun tanpa syarat tambahan. */
export async function adminForceDelete(target, admin) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "announcements", target.id));
  addAuditLog(batch, {
    actor: admin,
    action: AuditAction.FORCE_DELETE,
    target,
    newStatus: null,
  });
  await batch.commit();
}
