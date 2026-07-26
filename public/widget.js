(function () {
  const script = document.currentScript;
  const asiakas = script.getAttribute('data-asiakas') || 'turun-lukko';
  const RENDER_OSOITE = 'https://chatbot-projekti.onrender.com';

  async function alusta() {
    let asetukset;
    try {
      asetukset = await fetch(RENDER_OSOITE + '/api/asetukset/' + asiakas).then(r => r.json());
    } catch (e) {
      asetukset = { paavari: '#2563eb', logo: null };
    }

    const nappi = document.createElement('div');
    nappi.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: ${asetukset.paavari || '#2563eb'};
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 999999; transition: transform 0.2s;
      overflow: hidden;
      border: 1px solid black;
    `;

    if (asetukset.logo) {
      const kuva = document.createElement('img');
      kuva.src = RENDER_OSOITE + asetukset.logo;
      kuva.style.cssText = `width: 100%; height: 100%; object-fit: cover; border-radius: 50%;`;
      nappi.appendChild(kuva);
    } else {
      nappi.innerHTML = '💬';
      nappi.style.fontSize = '28px';
      nappi.style.color = 'white';
    }

    nappi.addEventListener('mouseenter', () => { nappi.style.transform = 'scale(1.08)'; });
    nappi.addEventListener('mouseleave', () => { nappi.style.transform = 'scale(1)'; });

    const ikkuna = document.createElement('iframe');
    ikkuna.src = RENDER_OSOITE + '/widget-chat.html?asiakas=' + encodeURIComponent(asiakas);
    ikkuna.style.cssText = `
      position: fixed; bottom: 90px; right: 20px;
      width: 350px; height: 450px; border: none;
      border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      display: none; z-index: 999999; background: white;
    `;

    document.body.appendChild(nappi);
    document.body.appendChild(ikkuna);
    window.addEventListener('message', (event) => {
  if (event.data === 'sulje-chat') {
    ikkuna.style.display = 'none';
  }
});

    nappi.addEventListener('click', () => {
      ikkuna.style.display = ikkuna.style.display === 'none' ? 'block' : 'none';
    });
  }

  alusta();
})();