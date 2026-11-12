const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pic = c => c.img ? `<img src="${esc(c.img)}" alt="${esc(c.word)}">` : 'Gambar';
const toast = t => { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3000); };

function speak(text, rate, btn) {
  if (!('speechSynthesis' in window)) return toast('Browser ini tidak mendukung audio.');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = rate;
  const vs = speechSynthesis.getVoices();
  const v = vs.find(v => /^en[-_]US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang));
  if (v) u.voice = v;
  u.onstart = () => btn.classList.add('on');
  u.onend = u.onerror = () => btn.classList.remove('on');
  speechSynthesis.speak(u);
}

async function home() {
  const cards = await (await fetch('/api/cards')).json();
  app.innerHTML = `<div class="wrap"><div class="top"><b>Flashcard Vocabulary</b></div>
  <p>Scan QR code pada flashcard, atau pilih kartu di bawah.</p>
  <div class="grid">${cards.map(c => `<a class="tile" href="/c/${esc(c.id)}"><div class="pic">${pic(c)}</div><b>${esc(c.word)}</b></a>`).join('')}</div></div>`;
}

async function cardView(id) {
  const r = await fetch('/api/cards/' + encodeURIComponent(id));
  if (!r.ok) { app.innerHTML = `<div class="wrap"><div class="top"><a href="/">← Semua kartu</a></div><h2>Kartu tidak ditemukan</h2><p>Pastikan QR code benar atau pilih kartu dari daftar.</p></div>`; return; }
  const c = await r.json();
  document.title = c.word + ' · Flashcard';
  const letters = c.word.toUpperCase().split('').map(ch => ch === ' ' ? '␣' : ch).join(' · ');
  app.innerHTML = `<div class="wrap"><div class="top"><a href="/">← Semua kartu</a></div>
  <main class="card-page">
    <section><div class="pic">${pic(c)}</div><div class="vocab">${esc(c.word)}</div></section>
    <section class="right">
      <div class="audio"><button class="play" id="p"><span class="bars"><i></i><i></i><i></i><i></i></span>Putar Audio</button><button class="slow" id="s">🐢 Pelan</button></div>
      <div class="spell"><small>Ejaan normal + IPA</small><span class="letters">${esc(letters)}</span>${c.ipa ? `<span class="ipa">/${esc(c.ipa)}/</span>` : ''}</div>
      ${c.meaning ? `<div class="meaning">${esc(c.meaning)}</div>` : ''}
    </section></main></div>`;
  document.getElementById('p').onclick = e => speak(c.word, 0.9, e.currentTarget);
  document.getElementById('s').onclick = e => speak(c.word, 0.5, e.currentTarget);
}

const m = location.pathname.match(/^\/c\/([^/]+)\/?$/);
(m ? cardView(decodeURIComponent(m[1])) : home()).catch(() => { app.innerHTML = '<div class="wrap"><p>Gagal memuat data.</p></div>'; });
