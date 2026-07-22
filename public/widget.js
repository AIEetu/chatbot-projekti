(function () {
  const nappi = document.createElement('div');
  nappi.innerHTML = '💬';
  nappi.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    width: 60px; height: 60px; border-radius: 50%;
    background: #2563eb; color: white; font-size: 28px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 999999;
  `;

  const ikkuna = document.createElement('iframe');
  ikkuna.src = 'http://localhost:3000/widget-chat.html';
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