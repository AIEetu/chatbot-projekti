require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const avaimet = {
  'turun-lukko': process.env.OPENAI_API_KEY_TURUN_LUKKO,
  'auto-mauno': process.env.OPENAI_API_KEY_AUTO_MAUNO,
'metsaranta-koti': process.env.OPENAI_API_KEY_METSARANTA,
'kivijalka-koti': process.env.OPENAI_API_KEY_KIVIJALKA,
'metsapolkuelainklinikka': process.env.OPENAI_API_KEY_METSAELAIN_KLINIKKA
};

const sheetsOsoitteet = {
  'turun-lukko': process.env.GOOGLE_SHEETS_URL_TURUN_LUKKO,
  'kivijalka-koti': process.env.GOOGLE_SHEETS_URL_KIVIJALKA,
};

// Reitti: antaa widgetille asiakkaan asetukset (nimi, värit, tervehdys)
app.get('/api/asetukset/:asiakas', (req, res) => {
  const asiakas = req.params.asiakas;
  const asetuksetPolku = path.join(__dirname, 'asiakkaat', asiakas, 'asetukset.json');

  if (!fs.existsSync(asetuksetPolku)) {
    return res.status(404).json({ virhe: 'Asiakasta ei löydy: ' + asiakas });
  }

  const asetukset = JSON.parse(fs.readFileSync(asetuksetPolku, 'utf8'));
  res.json(asetukset);
});

// Reitti: tallentaa tarjouspyynnön Google Sheetsiin
app.post('/api/tarjous', async (req, res) => {
  // ================================================================
// LISÄYS server.js:ään — tapahtumaseuranta / analytiikka
// Liitä tämä samaan tyyliin kuin /api/tarjous-reitti, esim. heti sen jälkeen.
// ================================================================

// Sama sheetsOsoitteet-objekti jota jo käytät /api/tarjous-reitissä,
// mutta ANALYTIIKALLE OMA Apps Script -URL (eri taulukko/välilehti kuin lomakkeet).
// Lisää tämä .env-tiedostoon:
//   GOOGLE_SHEETS_ANALYTIIKKA_URL=https://script.google.com/macros/s/.../exec
const analytiikkaSheetsUrl = process.env.GOOGLE_SHEETS_ANALYTIIKKA_URL;

// Reitti: kirjaa yksittäisen käyttäjätapahtuman (chat avattu, nappi klikattu, jne.)
app.post('/api/tapahtuma', async (req, res) => {
  try {
    const { asiakas, tapahtuma, lisatieto, istuntoId, sivu, aikaleima } = req.body;

    if (!analytiikkaSheetsUrl) {
      // Jos analytiikka-URL:ää ei ole vielä asetettu, ei kaadeta pyyntöä —
      // vastataan vain hiljaa ok, jotta botin toiminta ei koskaan häiriinny.
      return res.json({ status: 'ohitettu' });
    }

    // Ei odoteta Sheetsin vastausta pitkään - fire-and-forget-tyylisesti,
    // jotta analytiikka ei koskaan hidasta käyttäjän kokemusta.
    fetch(analytiikkaSheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asiakas, tapahtuma, lisatieto, istuntoId, sivu, aikaleima }),
    }).catch(virhe => console.error('Analytiikan tallennus epäonnistui:', virhe));

    res.json({ status: 'ok' });
  } catch (virhe) {
    console.error(virhe);
    // Analytiikka ei koskaan saa palauttaa virhettä käyttäjälle asti
    res.json({ status: 'virhe_ohitettu' });
  }
});
  try {
    const { asiakas, palvelu, nimi, puhelin, sahkoposti, osoite, postinumero, viesti } = req.body;

    const sheetsUrl = sheetsOsoitteet[asiakas];
    if (!sheetsUrl) {
      return res.status(404).json({ virhe: 'Lomaketta ei ole määritelty tälle asiakkaalle' });
    }

   await fetch(sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palvelu, nimi, puhelin, sahkoposti, osoite, postinumero, viesti }),
    });

    res.json({ status: 'ok' });
  } catch (virhe) {
    console.error(virhe);
    res.status(500).json({ virhe: 'Tallennus epäonnistui' });
  }
});

// Reitti: botin vastaus kysymykseen
app.post('/api/chat', async (req, res) => {
  try {
    const kysymys = req.body.kysymys;
    const asiakas = req.body.asiakas || 'turun-lukko';

    const apiAvain = avaimet[asiakas];
    if (!apiAvain) {
      return res.status(404).json({ virhe: 'API-avainta ei löydy asiakkaalle: ' + asiakas });
    }

    const openai = new OpenAI({ apiKey: apiAvain });

    const kansioPolku = path.join(__dirname, 'asiakkaat', asiakas);
    const tiedotPolku = path.join(kansioPolku, 'tiedot.txt');
    const asetuksetPolku = path.join(kansioPolku, 'asetukset.json');

    if (!fs.existsSync(tiedotPolku) || !fs.existsSync(asetuksetPolku)) {
      return res.status(404).json({ virhe: 'Asiakasta ei löydy: ' + asiakas });
    }

    const yritystiedot = fs.readFileSync(tiedotPolku, 'utf8');
    const asetukset = JSON.parse(fs.readFileSync(asetuksetPolku, 'utf8'));

    const vastaus = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `${asetukset.persoona}

Vastaa kysymyksiin VAIN alla olevan yritystiedon perusteella. Jos et löydä vastausta tiedoista, sano ettet tiedä.

Yritystiedot:
${yritystiedot}`
        },
        { role: "user", content: kysymys }
      ],
    });

    res.json({ vastaus: vastaus.choices[0].message.content });
  } catch (virhe) {
    console.error(virhe);
    res.status(500).json({ virhe: "Jotain meni pieleen" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Palvelin käynnissä: http://localhost:${PORT}`));