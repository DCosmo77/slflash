# Flashcard QR (self-host)

## Jalankan
    npm install
    export ADMIN_PASSWORD='password-kuat-anda'
    export SESSION_SECRET="$(openssl rand -hex 32)"
    export BASE_URL='https://domain-anda.com'   # dipakai untuk isi QR code
    export NODE_ENV=production                  # wajib jika memakai HTTPS
    npm start

- Publik : BASE_URL/  dan  BASE_URL/c/<id>  (isi QR code)
- Admin  : BASE_URL/admin  (login dulu)
- Data   : folder data/ (cards.json + uploads/) - backup folder ini.

## Keamanan
- private/ tidak pernah disajikan sebagai file statis; admin.html hanya dikirim jika sesi login valid.
- Semua API tulis (/api/admin/*) menolak permintaan tanpa sesi (401).
- Cookie sesi: httpOnly + SameSite=Strict (+ Secure di production). Login dibatasi 10x/15 menit per IP.
- Pasang HTTPS (Nginx/Caddy/Cloudflare) di depan Node. Jangan buka admin lewat HTTP biasa di internet.
- Simpan password di environment variable, jangan di-commit.
