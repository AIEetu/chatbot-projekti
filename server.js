const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

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

// Reitti: tallentaa tarjouspyynnön HubSpotiin (CRM) JA Google Sheetsiin (sähköpostivahvistusta varten)
app.post('/api/tarjous', async (req, res) => {
  try {
    const {
      nimi, puhelin, sahkoposti, osoite, postinumero, viesti, palvelu,
      kotityyppi, koko, remontit, budjetti, huoneet, ominaisuudet, aikataulu, varattuAika,
    } = req.body;

    if (!sahkoposti) {
      return res.status(400).json({ virhe: 'Sähköposti puuttuu' });
    }

    const [etunimi, ...loput] = (nimi || '').split(' ');
    const sukunimi = loput.join(' ');

    // ---- 1) Tallennus HubSpotiin (CRM, kontaktit) ----
    const kontaktinTiedot = {
      properties: {
        email: sahkoposti,
        firstname: etunimi || '',
        lastname: sukunimi || '',
        phone: puhelin || '',
        address: osoite || '',
        zip: postinumero || '',
        viesti: viesti || '',
        palvelu: palvelu || '',
        kotityyppi: kotityyppi || '',
        koko: koko || '',
        remontit: remontit || '',
        budjetti: budjetti || '',
        huoneet: huoneet || '',
        ominaisuudet: ominaisuudet || '',
        aikataulu: aikataulu || '',
        varattu_aika: varattuAika || '',
      },
    };

    const headers = {
      'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    };

        // Uudelle kontaktille asetetaan HubSpotin oma "Liidin tila" -kenttä arvoon "Uusi" —
    // päivityksessä (jo olemassa oleva kontakti) tätä EI kosketa, jotta myyjän itse
    // tekemä tilamerkintä ei ylikirjoidu
    const uudenKontaktinTiedot = {
      properties: {
        ...kontaktinTiedot.properties,
        hs_lead_status: 'NEW',
        hubspot_owner_id: HUBSPOT_OMISTAJA_ID,
      },
    };

    const luontiVastaus = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST', headers, body: JSON.stringify(uudenKontaktinTiedot),
    });

    if (luontiVastaus.status === 409) {
      await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(sahkoposti)}?idProperty=email`, {
        method: 'PATCH', headers, body: JSON.stringify(kontaktinTiedot),
      });
    } else if (!luontiVastaus.ok) {
      console.error('HubSpot-virhe:', await luontiVastaus.text());
      // Ei keskeytetä tähän — Sheets-tallennus/sähköposti yritetään silti
    }

    // ---- 2) Lähetys Google Sheetsin Apps Scriptiin (tallentaa Liidit-taulukkoon JA lähettää GmailApp-vahvistuksen) ----
    try {
      await fetch(process.env.GOOGLE_SHEETS_URL_KIVIJALKA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nimi, puhelin, sahkoposti, osoite, postinumero, viesti, palvelu }),
      });
    } catch (sheets_virhe) {
      console.error('Google Sheets -tallennus/sähköposti epäonnistui:', sheets_virhe);
    }

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