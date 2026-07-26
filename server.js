require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
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
};

const sheetsOsoitteet = {
  'turun-lukko': process.env.GOOGLE_SHEETS_URL_TURUN_LUKKO,
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
  try {
    const { asiakas, palvelu, nimi, puhelin, sahkoposti } = req.body;

    const sheetsUrl = sheetsOsoitteet[asiakas];
    if (!sheetsUrl) {
      return res.status(404).json({ virhe: 'Lomaketta ei ole määritelty tälle asiakkaalle' });
    }

    await fetch(sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palvelu, nimi, puhelin, sahkoposti }),
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