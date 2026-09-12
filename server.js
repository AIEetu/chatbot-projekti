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
// ---------- Live-chat: ihmisen reaaliaikainen mukaantulo ----------
// Jokaiselle asiakasyritykselle oma salasana agenttisivulle
const agenttiSalasanat = {
  'kivijalka-koti': process.env.AGENTTI_SALASANA_KIVIJALKA,
  // Lisää tähän jokainen uusi asiakas samalla kaavalla:
  // 'asiakastunnus': process.env.AGENTTI_SALASANA_ASIAKASTUNNUS,
};

// Väliaikainen muisti: { asiakas: { istuntoId: { tila, viestit: [...] } } }
const liveChatIstunnot = {};

function haeTaiLuoIstunto(asiakas, istuntoId) {
  if (!liveChatIstunnot[asiakas]) liveChatIstunnot[asiakas] = {};
  if (!liveChatIstunnot[asiakas][istuntoId]) {
    liveChatIstunnot[asiakas][istuntoId] = { tila: 'odottaa', viestit: [], luotu: Date.now(), asiakkaanNimi: '' };
  }
  return liveChatIstunnot[asiakas][istuntoId];
}

// Asiakas pyytää ihmistä keskusteluun
app.post('/api/live/pyynto', (req, res) => {
  const { asiakas, istuntoId, nimi } = req.body;
  if (!asiakas || !istuntoId) return res.status(400).json({ virhe: 'Puuttuvia tietoja' });
  const istunto = haeTaiLuoIstunto(asiakas, istuntoId);
  istunto.tila = 'odottaa';
  if (nimi) istunto.asiakkaanNimi = nimi;
  res.json({ status: 'ok' });
});

// Viestin lähetys — käytetään sekä asiakkaan että agentin puolelta
app.post('/api/live/viesti', (req, res) => {
  const { asiakas, istuntoId, lahettaja, teksti } = req.body;
  if (!asiakas || !istuntoId || !teksti) return res.status(400).json({ virhe: 'Puuttuvia tietoja' });
  const istunto = haeTaiLuoIstunto(asiakas, istuntoId);
  istunto.viestit.push({ lahettaja, teksti, aika: Date.now() });
  if (lahettaja === 'agentti') istunto.tila = 'kaynnissa';
  res.json({ status: 'ok' });
});

// Asiakas sulkee keskustelun (X, Takaisin, tai siirtyy pois chatista)
app.post('/api/live/sulje', (req, res) => {
  const { asiakas, istuntoId } = req.body;
  const istunto = liveChatIstunnot[asiakas]?.[istuntoId];
  if (istunto) istunto.tila = 'suljettu';
  res.json({ status: 'ok' });
});

// Asiakkaan botti pollaa: onko uusia viestejä agentilta?
app.get('/api/live/viestit', (req, res) => {
  const { asiakas, istuntoId } = req.query;
  const istunto = liveChatIstunnot[asiakas]?.[istuntoId];
  if (!istunto) return res.json({ tila: 'odottaa', viestit: [] });
  res.json({ tila: istunto.tila, viestit: istunto.viestit });
});

// Agentin kirjautuminen
app.post('/api/live/kirjaudu', (req, res) => {
  const { asiakas, salasana } = req.body;
  if (agenttiSalasanat[asiakas] && agenttiSalasanat[asiakas] === salasana) {
    res.json({ status: 'ok' });
  } else {
    res.status(401).json({ virhe: 'Väärä tunnus tai salasana' });
  }
});

// Agentin näkymä pollaa: mitkä keskustelut ovat käynnissä/odottavat?
app.get('/api/live/istunnot', (req, res) => {
  const { asiakas, salasana } = req.query;
  if (!agenttiSalasanat[asiakas] || agenttiSalasanat[asiakas] !== salasana) {
    return res.status(401).json({ virhe: 'Ei oikeuksia' });
  }
  const istunnot = liveChatIstunnot[asiakas] || {};
  const lista = Object.entries(istunnot)
    .filter(([id, s]) => s.tila !== 'suljettu')
    .map(([id, s]) => ({
      istuntoId: id, tila: s.tila, nimi: s.asiakkaanNimi,
      viimeisinViesti: s.viestit[s.viestit.length - 1] || null,
    }))
    .sort((a, b) => (b.viimeisinViesti?.aika || 0) - (a.viimeisinViesti?.aika || 0));
  res.json({ istunnot: lista });
});

// Agentti hakee yhden istunnon täyden viestihistorian
app.get('/api/live/istunto', (req, res) => {
  const { asiakas, salasana, istuntoId } = req.query;
  if (!agenttiSalasanat[asiakas] || agenttiSalasanat[asiakas] !== salasana) {
    return res.status(401).json({ virhe: 'Ei oikeuksia' });
  }
  const istunto = liveChatIstunnot[asiakas]?.[istuntoId];
  if (!istunto) return res.status(404).json({ virhe: 'Istuntoa ei löydy' });
  res.json({ tila: istunto.tila, nimi: istunto.asiakkaanNimi, viestit: istunto.viestit });
});

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