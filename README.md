# Kartu Terkecil — Multiplayer Web

Kartu Terkecil adalah permainan kartu multiplayer realtime berbasis web. Server bersifat authoritative: logika permainan, dek, dan validasi dijalankan di server sementara klien hanya menampilkan UI dan mengirim aksi pemain.

Status: Proyek siswa / proof-of-concept

## Fitur utama
- Mode Classic: 4–15 pemain (otomatis memakai 2 deck untuk 13–15 pemain)
- Mode 1v1 Duel: tepat 2 pemain
- Real-time sync dengan Socket.IO
- Server-authoritative: aturan dan penalti diproses di server
- Mudah dijalankan secara lokal atau dalam LAN

## Demo & Screenshot
(Berikan screenshot atau tautan demo jika tersedia — tambahkan file di `public/` atau tautkan App Service bila dideploy.)

## Persyaratan
- Node.js (LTS direkomendasikan)
- npm

## Menjalankan secara lokal
```bash
npm install
npm start
```
Server akan mendengarkan pada PORT yang ditentukan oleh `process.env.PORT` atau default 3000.
Buka http://localhost:3000 untuk memulai permainan.

### Menjalankan di LAN
1. Jalankan server pada satu PC.
2. Cari IP lokal PC server, mis. `192.168.1.10`.
3. Pemain lain membuka `http://192.168.1.10:3000`.

## Aturan singkat (yang diimplementasikan)
- 4–15 pemain; urutan join menentukan giliran searah jarum jam.
- Setiap pemain mendapat 4 kartu awal.
- Pada awal permainan, pemain dapat melihat tepat 2 kartu sendiri selama 3 detik.
- Kartu rangkaian aksi:
  - 7/8: lihat 1 kartu sendiri yang belum diketahui selama 2 detik.
  - 9/10: lihat 1 kartu lawan selama 2 detik.
  - J: tukar 1 kartu dengan lawan secara tertutup.
  - Q dan K hitam: bandingkan 1 kartu sendiri dengan 1 kartu lawan; kartu terlihat 2 detik lalu pemain memilih tukar atau tidak.
  - K merah: bernilai -2 (tanpa efek khusus selain nilai).
  - K hitam: bernilai 13 (efek sama seperti Q — lihat, banding, dan bisa tukar).
- Buang kartu dengan rank yang sama seperti kartu teratas dapat dilakukan kapan saja.
- Salah membuang atau memasang kartu mendapat penalti +1 kartu dari deck.
- Dek habis juga mengakhiri permainan.
- Siapa pun boleh deklarasi "Selesai"; setelah deklarasi, semua pemain lain mendapat tepat 1 giliran terakhir dimulai dari pemain setelah deklarator, lalu semua kartu dibuka dan skor dihitung.
- Untuk 13–15 pemain server otomatis memakai 2 deck remi standar (tanpa joker) sehingga kartu yang sama dapat muncul lebih dari sekali.

Catatan: aturan di atas merepresentasikan apa yang saat ini diimplementasikan. Untuk detail aturan resmi atau variasi rumah, lihat kode server.

## Desain & Catatan teknis
- Server autoritatif mencegah cheating: semua aksi divalidasi di server.
- Socket.IO digunakan untuk komunikasi realtime. Pastikan WebSockets diaktifkan bila dideploy ke platform yang memerlukan pengaturan khusus (mis. Azure App Service).
- Arsitektur saat ini cocok untuk satu instance; jangan melakukan scale-out tanpa mekanisme shared state / adapter (Redis, socket.io-adapter, dsb.).

## Azure App Service (petunjuk deploy)
Rekomendasi target deploy: Azure App Service (Linux, Node.js LTS)

1. Pastikan `package.json`, `server.js`, dan `public/` berada di root proyek.
2. Uji lokal (`npm install` kemudian `npm start`).
3. Di Azure Portal buat App Service dengan runtime Node.js (mis. Node 24 LTS).
4. Deploy lewat VS Code Azure App Service extension, GitHub Actions, atau ZIP deployment.
5. Di App Service > Configuration > General settings: aktifkan **WebSockets = On**.
6. Server sudah mendengarkan `process.env.PORT`.

Catatan: untuk proyek kecil satu instance App Service biasanya cukup. Jika ingin skalabilitas, tambahkan shared backplane (Redis) untuk Socket.IO.

## Mode 1v1 Duel
- Mode ini untuk tepat 2 pemain.
- Aturan kartu sama seperti mode Classic.
- Host dapat mulai segera saat lawan bergabung.
- Deklarasi "Selesai" memberi lawan satu giliran terakhir sebelum penghitungan.

## Kontribusi
Semua kontribusi kecil sangat dihargai. Contoh kontribusi:
- Memperbaiki bug UI/UX
- Menambah dokumentasi
- Menambah tes atau validasi server

Cara kontributor:
1. Fork repo
2. Buat branch fitur: `git checkout -b fix/readme`
3. Commit dan push
4. Buka pull request

## Troubleshooting singkat
- Jika koneksi realtime bermasalah di deploy, periksa bahwa WebSockets di platform hosting diaktifkan.
- Jika muncul masalah BIND PORT, pastikan `PORT` diset di lingkungan hosting.

## License
Lisensi: MIT

## Kontak
Untuk pertanyaan atau demo, buka issue di repo atau hubungi pemilik repo.
