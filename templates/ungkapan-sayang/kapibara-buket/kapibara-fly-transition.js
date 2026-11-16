window.KapibaraFlyTransition = (() => {

  // Sprite kapibara (pakai aset asli project, bukan bunga) â€” direferensikan
  // lewat path relatif, bukan base64, supaya gampang diganti/ditambah nanti.
  const SPRITES = [
    'templates/ungkapan-sayang/kapibara-buket/assets/kapibara.webp',
    'templates/ungkapan-sayang/kapibara-buket/assets/kapibara-setelah.png',
    'templates/ungkapan-sayang/kapibara-buket/assets/kapibara.webp',
    'templates/ungkapan-sayang/kapibara-buket/assets/kapibara-setelah.png',
  ];

  // ---- Konfigurasi timing (ms) ----
  const IN_DUR   = 850;   // durasi terbang masuk per bunga
  const IN_SPREAD= 340;   // rentang stagger fase masuk (tepi dulu, tengah terakhir)
  const HOLD     = 1000;  // durasi bunga "menari di tempat" saat layar tertutup
  const OUT_DUR  = 820;   // durasi terbang keluar
  const OUT_SPREAD=320;   // rentang stagger fase keluar (tengah dulu, tepi terakhir)
  const EASE_IN  = 'cubic-bezier(.25,.75,.25,1)'; // cepat lalu mendarat halus
  const EASE_OUT = 'cubic-bezier(.55,.06,.68,.19)'; // mulai pelan lalu melesat

  const overlay = document.getElementById('kf-overlay');
  let imgs = null;       // HTMLImageElement yang sudah ter-decode
  let pool = null;       // ladang bunga yang sudah dibangun (warm pool)
  let playing = false;

  const rand = (a, b) => a + Math.random() * (b - a);

  async function preload(){
    if (imgs) return imgs;
    imgs = await Promise.all(SPRITES.map(src => {
      const im = new Image();
      im.src = src;
      // decode() menjamin bitmap siap di GPU sebelum dipakai.
      return im.decode().then(() => im).catch(() => im);
    }));
    return imgs;
  }

  /* Bangun "ladang bunga": grid menutup viewport + 1 ring di luar tepi,
     dengan jitter posisi supaya terlihat organik tetapi cakupan tetap
     terjamin (ukuran bunga â‰¥ 2.2x sel, jitter â‰¤ 0.2x sel â†’ tidak ada celah). */
  function buildField(){
    const vw = innerWidth, vh = innerHeight;
    const cx = vw / 2, cy = vh / 2;

    // Pembagi 42 dikalibrasi agar total elemen (termasuk 1 ring di luar
    // tepi layar) berkisar 60 di ponsel s.d. Â±80 di desktop â€” cukup padat
    // untuk menutup penuh, cukup hemat untuk tetap 60fps.
    const cell = Math.max(110, Math.sqrt((vw * vh) / 42));
    const cols = Math.ceil(vw / cell) + 2;
    const rows = Math.ceil(vh / cell) + 2;
    const maxDist = Math.hypot(cx, cy);

    const flowers = [];
    for (let r = 0; r < rows; r++){
      for (let c = 0; c < cols; c++){
        // pusat sel, digeser -cell/2 agar ring pertama menjorok keluar tepi
        const tx = (c + 0.5) * cell - cell / 2 + rand(-0.2, 0.2) * cell;
        const ty = (r + 0.5) * cell - cell / 2 + rand(-0.2, 0.2) * cell;

        const size = cell * rand(2.2, 2.6);
        const rotEnd = rand(-30, 30);
        const spin = (Math.random() < 0.5 ? -1 : 1) * rand(120, 260);

        // Arah radial dari pusat layar â†’ titik target.
        // Posisi awal/akhir = target didorong keluar melewati tepi layar.
        let dx = tx - cx, dy = ty - cy;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const push = maxDist + size; // pasti sepenuhnya di luar layar
        const ox = tx + dx * push;
        const oy = ty + dy * push;

        const dCenter = Math.hypot(tx - cx, ty - cy);
        flowers.push({
          sprite: imgs[(Math.random() * imgs.length) | 0],
          size, tx, ty, ox, oy, rotEnd, spin,
          // masuk: tepi mendarat dulu â†’ tengah terakhir (layar menutup ke dalam)
          delayIn : (1 - Math.min(dCenter / maxDist, 1)) * IN_SPREAD + rand(0, 70),
          // keluar: tengah pergi dulu â†’ terbuka dari dalam ke luar
          delayOut: (1 - Math.min(dCenter / maxDist, 1)) * OUT_SPREAD + rand(0, 60),
        });
      }
    }
    return flowers;
  }

  const offT = f => `translate3d(${f.ox - f.size/2}px, ${f.oy - f.size/2}px, 0) rotate(${f.rotEnd - f.spin}deg) scale(.45)`;
  const onT  = f => `translate3d(${f.tx - f.size/2}px, ${f.ty - f.size/2}px, 0) rotate(${f.rotEnd}deg) scale(1)`;
  const exitT= f => `translate3d(${f.ox - f.size/2}px, ${f.oy - f.size/2}px, 0) rotate(${f.rotEnd + f.spin * .8}deg) scale(.5)`;

  const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* Warm pool: bangun seluruh elemen bunga SEKARANG (saat halaman idle),
     bukan saat tombol diklik. Semua bunga sudah berada di posisi awal
     (di luar layar, overlay overflow:hidden â†’ tidak terlihat), tetapi
     layer GPU-nya sudah dibuat dan sprite sudah dirasterisasi.
     Hasilnya: play() tidak membayar biaya apa pun di frame pertama. */
  async function warm(){
    await preload();
    if (playing) return;
    overlay.replaceChildren();
    pool = buildField();
    const frag = document.createDocumentFragment();
    for (const f of pool){
      const el = document.createElement('div');
      el.className = 'kf-flower';
      el.style.width = f.size + 'px';
      el.style.transform = offT(f);
      // Parameter sway acak per bunga. Siklus dipendekkan (1.1-1.8s) supaya
      // gerakannya terasa lebih kencang dan tetap terbaca dalam hold 1 detik,
      // amplitudo sedikit dinaikkan agar gerak tetap jelas di siklus cepat.
      el.style.setProperty('--sw-dur',   rand(1.1, 1.8).toFixed(2) + 's');
      el.style.setProperty('--sw-delay', (-rand(0, 1.8)).toFixed(2) + 's'); // fase acak
      el.style.setProperty('--sw-rot',   rand(3.5, 6.5).toFixed(1) + 'deg');
      el.style.setProperty('--sw-drift', rand(4, 8).toFixed(1) + 'px');
      const spr = f.sprite.cloneNode();
      spr.className = 'kf-sprite';
      el.appendChild(spr);
      f.el = el;
      frag.appendChild(el);
    }
    overlay.appendChild(frag);
    overlay.classList.add('is-on');
  }

  // Rebuild pool jika viewport berubah (rotasi layar, resize window).
  let rszTimer;
  addEventListener('resize', () => {
    clearTimeout(rszTimer);
    rszTimer = setTimeout(() => { if (!playing) warm(); }, 250);
  });

  async function play({ onCovered } = {}){
    if (playing) return;
    playing = true;

    // Aksesibilitas: pengguna reduced-motion mendapat pergantian langsung.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches){
      onCovered && onCovered();
      playing = false;
      return;
    }

    if (!pool) await warm();
    const flowers = pool;

    // 1) Pastikan semua bunga di posisi awal tanpa transisi (untuk replay),
    //    lalu nyalakan sway SEKARANG selagi semua masih di luar layar,
    //    supaya lompatan frame pertama keyframes tidak pernah terlihat.
    for (const f of flowers){
      f.el.style.transition = 'none';
      f.el.style.transform = offT(f);
    }
    overlay.classList.add('is-anim');

    // 2) Commit state awal dulu (double rAF), baru pasang state akhir.
    await nextFrame();
    for (const f of flowers){
      f.el.style.transition = `transform ${IN_DUR}ms ${EASE_IN} ${f.delayIn}ms`;
      f.el.style.transform = onT(f);
    }

    // 3) Tunggu sampai layar benar-benar tertutup â†’ tukar konten.
    await wait(IN_DUR + IN_SPREAD + 90);
    onCovered && onCovered();
    await wait(HOLD);

    // 4) Fase keluar: bunga melesat keluar secara radial.
    for (const f of flowers){
      f.el.style.transition = `transform ${OUT_DUR}ms ${EASE_OUT} ${f.delayOut}ms`;
      f.el.style.transform = exitT(f);
    }
    await wait(OUT_DUR + OUT_SPREAD + 80);

    overlay.classList.remove('is-anim'); // hentikan sway saat idle (hemat GPU)
    playing = false;
  }

  return { preload, warm, play };
})();

