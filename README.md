# Aplikasi Pengumuman SMK YASBAM — Versi JavaScript

Versi ini sudah ditambahkan pada pages github. Saya telah menyediakan file "LINK-WEB.url" sebagai shortcut

## Struktur Folder

```
index.html                 # shell HTML, memuat font & css/style.css & js/app.js
css/style.css               # tema visual kayu/perkamen ala Stardew Valley
js/
  firebase-config.js         # PLACEHOLDER — wajib diisi config Firebase Anda
  models.js                  # enum peran/kategori/status + util musim & tanggal
  auth-service.js             # login per-peran, buat akun guru/murid
  user-service.js              # daftar & hapus akun (khusus admin)
  announcement-service.js       # CRUD pengumuman + alur persetujuan
  calendar.js                    # render kalender Stardew ke DOM
  announcement-card.js            # kartu perkamen satu pengumuman
  announcement-form.js             # modal form tambah/edit pengumuman
  day-sheet.js                      # modal daftar pengumuman per tanggal
  app.js                              # entry point / router berbasis status login
  views/
    login-view.js, public-view.js, admin-view.js, teacher-view.js,
    student-view.js, profile-view.js
firestore.rules              # aturan keamanan server — SAMA PERSIS dgn versi Dart
package.json, capacitor.config.json   # untuk membungkus jadi APK Android
```

## Ringkasan Aturan Akses (tidak berubah dari versi Dart)

| Aturan | Implementasi |
|---|---|
| Bisa dilihat semua orang | `views/public-view.js` tampil tanpa login, hanya pengumuman berstatus **disetujui** |
| Login hanya Admin/Guru/Murid | `views/login-view.js` — 3 tab, tanpa pendaftaran publik |
| Akun murid hanya dibuat guru/admin | `auth-service.js: addStudent()` |
| Hanya akun internal boleh ubah/tambah/hapus pengumuman | Ditegakkan di `firestore.rules` (server) |
| Perubahan murid harus disetujui admin/guru | Pengumuman dari murid otomatis `pending`; guru/admin approve/tolak |
| Guru maksimal 1 murid/akun | Field `studentId`, dicek di klien **dan** via Firestore **transaction** + rules |
| Admin punya semua akses (termasuk hapus akun) | `user-service.js: deleteUserProfile()`, rules `isAdmin()` selalu lolos |

## Perbaikan Login & Routing

Versi ini sudah memperbaiki beberapa masalah pada alur autentikasi:

- Tombol login hanya memakai event `submit`, sehingga satu klik tidak lagi menjalankan login dua kali.
- Router menunggu profil Firestore `users/{UID}` sebelum menentukan dashboard.
- Profil tidak ditemukan dibedakan dari error `permission-denied`/koneksi Firestore.
- Error listener `onSnapshot()` sekarang diteruskan ke router dan ditampilkan secara jelas.
- Router memakai generation guard agar callback sesi lama tidak menimpa tampilan sesi baru.
- `loginAs()` memvalidasi role sebelum menganggap login selesai dan membersihkan sesi jika validasi gagal.
- Pesan kegagalan login tidak lagi langsung tertimpa oleh redirect ke kalender publik ketika `signOut()` terjadi sebagai bagian dari validasi.

### Checklist setelah deploy

1. Isi `js/firebase-config.js` dengan konfigurasi Web App dari Firebase Console.
2. Pastikan Authentication → Email/Password aktif.
3. Pastikan Firestore Rules dari `firestore.rules` sudah dipublish.
4. Pastikan dokumen `users/{UID}` memiliki Document ID yang sama persis dengan UID di Firebase Authentication.
5. Nilai `role` harus salah satu dari `admin`, `teacher`, atau `student`.

Jika login Firebase berhasil tetapi profil belum ada, aplikasi sekarang menampilkan pesan diagnostik alih-alih diam-diam kembali ke kalender publik.

## Langkah Setup

### 1. Setup Firebase (Auth + Firestore) — sama seperti versi Dart
1. Buat project di https://console.firebase.google.com (paket gratis "Spark" cukup).
2. **Build → Authentication → Sign-in method** → aktifkan **Email/Password**.
3. **Build → Firestore Database** → **Create database** (mode production).
4. **Project Settings → General → Your apps** → klik ikon web `</>` untuk
   mendaftarkan web app, lalu salin objek `firebaseConfig` yang muncul.
5. Buka `js/firebase-config.js` dan **ganti** nilai `firebaseConfig` dengan
   hasil salinan tadi (tidak perlu tool tambahan seperti FlutterFire CLI —
   cukup tempel langsung).
6. Deploy `firestore.rules`: buka **Firestore Database → Rules** di
   Firebase Console, salin-tempel isi file `firestore.rules`, klik **Publish**.

### 2. Buat akun Admin pertama (manual, sekali saja)
Sama seperti versi Dart:
1. **Authentication → Users → Add user** → isi email & password admin, salin **User UID**-nya.
2. **Firestore Database** → buat koleksi `users` dengan **Document ID = UID tadi**, isi field:
   ```
   name: "Nama Admin"
   email: "admin@yasbam.sch.id"
   role: "admin"
   teacherId: null
   studentId: null
   createdBy: "system"
   createdAt: (tipe timestamp, isi waktu sekarang)
   ```
3. Login lewat tab **Admin** di halaman login dengan email/password tadi.

### 3. Menjalankan secara lokal
Karena `index.html` memakai ES Modules (`<script type="module">`), file
tidak bisa dibuka langsung lewat `file://` — harus lewat server lokal:

```bash
npx serve .
# atau
python3 -m http.server 8000
```

Lalu buka `http://localhost:8000` (atau port yang ditampilkan) di browser.

### 4. Hosting di GitHub Pages
1. Push seluruh folder ini ke repository GitHub (lihat panduan langkah-git
   yang sudah dibahas sebelumnya).
2. Di repo, buka **Settings → Pages**.
3. Pilih **Source: Deploy from a branch**, branch **main**, folder **/ (root)**.
4. Tunggu 1–2 menit, situs akan tersedia di `https://USERNAME.github.io/NAMA-REPO/`.

Tidak perlu GitHub Actions/workflow apa pun untuk versi ini — murni file statis.

### 5. Membungkus jadi Aplikasi Android (Capacitor)
Sekali saja di komputer Anda (butuh Node.js & Android Studio terpasang):
```bash
npm install
npx cap init "SMK YASBAM" "id.sch.yasbam.pengumuman" --web-dir .
npm run android:add      # membuat folder android/
npm run android:sync     # menyalin index.html, css/, js/ ke proyek Android
npm run android:open     # membuka di Android Studio untuk di-build jadi APK
```
Di Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.

> Catatan: karena aplikasi ini memakai Firebase Auth (redirect email/password
> biasa, bukan Google Sign-In), tidak perlu konfigurasi native tambahan di
> Android — cukup pastikan perangkat terhubung internet.

## Alur Persetujuan Pengumuman
- **Murid** tambah/edit pengumuman → status `pending` sampai disetujui guru/admin miliknya.
- **Murid** hapus pengumuman → status `pendingDelete` sampai dikonfirmasi guru/admin.
- **Guru** (untuk diri sendiri & 1 murid yang ditambahkannya) / **Admin** →
  langsung berlaku (`approved` / terhapus), tanpa persetujuan tambahan.

## Batasan yang Perlu Diketahui
- Firebase API key yang ditaruh di `js/firebase-config.js` akan terlihat oleh
  siapa pun yang membuka situs (lumrah untuk aplikasi web Firebase —
  keamanan sesungguhnya berasal dari **Firestore Security Rules**, bukan
  dari menyembunyikan key ini). Jangan bingung jika repo GitHub Anda publik
  dan key ini ikut terlihat di kode sumber.
- Menghapus akun murid/guru oleh admin menghapus **profil** di Firestore.
  Menghapus **kredensial login** Firebase Authentication milik pengguna
  lain memerlukan Firebase Admin SDK di server (Cloud Functions) — tidak
  bisa dilakukan dari kode client (browser) karena alasan keamanan Firebase.
- Batas "maksimal 1 murid/guru" ditegakkan dengan Firestore **transaction**
  + Security Rules (tahan race condition di sisi data), namun jika dua
  percobaan tambah-murid untuk guru yang sama terjadi dalam hitungan
  milidetik yang sama, akun Firebase Authentication utk percobaan yang
  gagal bisa saja sudah terlanjur terbuat. Sangat jarang terjadi;
  penyelesaian sempurna perlu Cloud Function di server.
- "Musim" pada kalender murni gaya visual terinspirasi Stardew Valley,
  bukan data cuaca sungguhan.
- Versi Firebase SDK di-load dari CDN (`gstatic.com/firebasejs/10.13.2/...`)
  langsung di setiap file `js/*.js`. Untuk memperbarui versi, ganti angka
  versi di semua `import` yang mengarah ke `firebasejs/`.

## Ide Pengembangan Lanjutan
- Notifikasi push (Firebase Cloud Messaging).
- Lampiran gambar/file pada pengumuman (Firebase Storage).
- Pencarian & filter kategori/target pembaca pada kalender publik.
