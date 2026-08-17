# Kartu Terkecil — Multiplayer Web

## Stack
- Node.js
- Express
- Socket.IO
- HTML/CSS/JavaScript
- Server authoritative: kartu dan aturan utama diproses di server.

## Menjalankan
```bash
npm install
npm start
```

Buka `http://localhost:3000`.

Untuk LAN:
1. Jalankan server pada satu PC.
2. Cari IP lokal PC server, misalnya `192.168.1.10`.
3. Pemain lain membuka `http://192.168.1.10:3000`.

## Aturan yang diimplementasikan
- 4–15 pemain, urutan join menentukan urutan giliran searah jarum jam.
- 4 kartu awal per pemain; tepat 2 kartu awal dapat dilihat selama 3 detik.
- 7/8: lihat 1 kartu sendiri yang belum diketahui selama 2 detik.
- 9/10: lihat 1 kartu lawan selama 2 detik.
- J: tukar 1 kartu dengan lawan secara tertutup.
- Q dan K hitam: bandingkan 1 kartu sendiri dengan 1 kartu lawan; kartu terlihat 2 detik lalu pemain memilih tukar/tidak.
- K merah: nilai -2, tanpa efek.
- K hitam bernilai 13 (efek sama seperti Q: lihat, bandingkan, dan bisa tukar).
- Buang kartu dengan rank yang sama seperti kartu teratas dapat dilakukan kapan saja.
- Salah membuang/memasang kartu: +1 kartu dari dek sebagai penalti.
- "Selesai": siapa pun boleh deklarasi; semua pemain lain mendapat tepat 1 giliran terakhir dimulai dari pemain setelah deklarator, lalu semua kartu dibuka.
- Dek habis juga mengakhiri permainan.
- Untuk 13–15 pemain server otomatis memakai 2 deck remi standar tanpa joker karena 1 deck 52 kartu tidak cukup untuk 4 kartu × 15 pemain.

## Catatan desain
Untuk 13–15 pemain, kartu yang sama dapat muncul lebih dari sekali karena memakai dua deck. Ini sengaja agar batas 15 pemain tetap bisa dipenuhi tanpa joker.


## Azure App Service

Recommended deployment target: Azure App Service (Linux, Node.js LTS).

1. Make sure `package.json`, `server.js`, and `public/` are at the project root.
2. Test locally with `npm install` then `npm start`.
3. In Azure Portal create an App Service using Node.js 24 LTS.
4. Deploy this project through VS Code Azure App Service extension, GitHub Actions, or ZIP deployment.
5. In App Service > Configuration > General settings, turn **WebSockets = On** because the game uses Socket.IO for real-time multiplayer.
6. The server already listens on `process.env.PORT`, which is required by App Service.
7. Open the generated `https://<app-name>.azurewebsites.net` URL.

For a small student project, one App Service instance is enough. Do not scale to multiple instances unless the Socket.IO architecture is changed to use a shared backplane/service.

## 1v1 Duel

The home screen has two modes:
- Classic 4–15: original multiplayer mode.
- 1v1 Duel: exactly 2 players.

The same card rules are used. In 1v1, the second player joins the room and the host can start immediately. A `Selesai` declaration gives the other player one final turn before scoring.
