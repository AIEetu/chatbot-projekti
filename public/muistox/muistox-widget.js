(function () {
  const RENDER_OSOITE = 'https://chatbot-projekti.onrender.com';
  const PAAVARI = '#c1653f';
  const PAAVARI_TUMMA = '#9c4d2f';

  // ---- kelluva launcher-nappi ----
  const nappi = document.createElement('button');
  nappi.setAttribute('aria-label', 'Avaa keskustelu');
  nappi.style.cssText = `
    position: fixed;
    bottom: 24px; right: 24px;
    width: 64px; height: 64px;
    border-radius: 50%;
    background: linear-gradient(145deg, ${PAAVARI}, ${PAAVARI_TUMMA});
    border: none;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 12px 28px rgba(156,77,47,0.35);
    z-index: 999999;
  `;
  nappi.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="26" height="26">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  `;

  // pieni pulssirengas huomion herättämiseksi
  const rengas = document.createElement('style');
  rengas.textContent = `
    @keyframes kivijalkaPulssi {
      0% { box-shadow: 0 0 0 0 rgba(193,101,63,0.5); }
      80% { box-shadow: 0 0 0 14px rgba(193,101,63,0); }
      100% { box-shadow: 0 0 0 14px rgba(193,101,63,0); }
    }
  `;
  document.head.appendChild(rengas);
  nappi.style.animation = 'kivijalkaPulssi 2.4s ease-out infinite';

  // ---- iframe (paneeli), piilotettuna aluksi ----
  const ikkuna = document.createElement('iframe');
  ikkuna.src = RENDER_OSOITE + '/kivijalka-panel.html';
  ikkuna.title = 'Kivijalka Koti -keskustelu';
  ikkuna.style.cssText = `
    position: fixed;
    bottom: 24px; right: 24px;
    width: 392px; max-width: calc(100vw - 24px);
    height: 640px; max-height: calc(100vh - 48px);
    border: none;
    border-radius: 26px;
    box-shadow: 0 34px 80px rgba(31,42,55,0.28);
    display: none;
    z-index: 999999;
    background: #fff;
  `;

  document.body.appendChild(nappi);
  document.body.appendChild(ikkuna);

  function avaaChat() {
    ikkuna.style.display = 'block';
    nappi.style.display = 'none';
  }
  function suljeChat() {
    ikkuna.style.display = 'none';
    nappi.style.display = 'flex';
  }

  nappi.addEventListener('click', avaaChat);

  // Paneelin oma sulkemisnappi lähettää postMessage-viestin, jonka nappaamme tässä
  window.addEventListener('message', (event) => {
    if (event.data === 'sulje-chat') {
      suljeChat();
    }
  });

  // Pienillä näytöillä (puhelimet) iframe täyttää koko ruudun kun se on auki
  function paivitaKoko() {
    if (window.innerWidth <= 480) {
      ikkuna.style.cssText += `
        bottom: 0; right: 0; left: 0; top: 0;
        width: 100%; height: 100%;
        max-width: 100%; max-height: 100%;
        border-radius: 0;
      `;
    }
  }
  paivitaKoko();
  window.addEventListener('resize', paivitaKoko);
})();