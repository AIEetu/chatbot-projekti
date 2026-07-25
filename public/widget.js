(function () {
  // ===== MUOKKAA NÄITÄ =====
  const script = document.currentScript;
  const asiakas = script.getAttribute('data-asiakas') || 'turun-lukko';
  const PAANVARI = '#2563eb';
  const IKONI = '💬';
  const RENDER_OSOITE = 'https://chatbot-projekti.onrender.com';
  // ==========================

  const nappi = document.createElement('div');
  nappi.innerHTML = IKONI;
  nappi.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    width: 60px; height: 60px; border-radius: 50%;
    background: ${PAANVARI}; color: white; font-size: 28px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 999999; transition: transform 0.2s;
  `;

  nappi.addEventListener('mouseenter', () => {
    nappi.style.transform = 'scale(1.08)';
  });
  nappi.addEventListener('mouseleave', () => {
    nappi.style.transform = 'scale(1)';
  });

  const ikkuna = document.createElement('iframe');
  ikkuna.src = RENDER_OSOITE + '/widget-chat.html';
  ikkuna.style.cssText = `
    position: fixed; bottom: 90px; right: 20px;
    width: 350px; height: 450px; border: none;
    border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    display: none; z-index: 999999; background: white;
  `;

  document.body.appendChild(nappi);
  document.body.appendChild(ikkuna);

  nappi.addEventListener('click', () => {
    ikkuna.style.display = ikkuna.style.display === 'none' ? 'block' : 'none';
  });
})();