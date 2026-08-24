const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const nodemailer = require('nodemailer');
const asiakasAsetukset = {
  'kivijalka-koti': {
    yritysNimi: 'Kivijalka Koti',
    gmailUser: process.env.GMAIL_USER_KIVIJALKA,
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD_KIVIJALKA,
    asiakaspalveluSahkoposti: process.env.ASIAKASPALVELU_SAHKOPOSTI_KIVIJALKA,
  },
};
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
async function laheteVahvistusEmail({ nimi, sahkoposti, viesti, asetukset }) {
  if (!sahkoposti || sahkoposti.indexOf('@') === -1) return;
  if (!asetukset.gmailUser || !asetukset.gmailAppPassword) {
    console.error('Sähköpostitunnuksia ei ole asetettu tälle asiakkaalle.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: asetukset.gmailUser, pass: asetukset.gmailAppPassword },
  });

  const etunimi = (nimi || '').split(' ')[0] || '';
  const tervehdys = etunimi ? `Hei ${etunimi},` : 'Hei,';
  const yritysNimi = asetukset.yritysNimi;

  const yhteenvetoRivit = (viesti || '')
    .split(',').map(r => r.trim()).filter(r => r.length > 0)
    .map(r => '– ' + r).join('\n');

  const runko =
    `${tervehdys}\n\nKiitos kun jätit yhteystietosi ${yritysNimi}lle!\n\n` +
    (yhteenvetoRivit ? `Tässä mitä kerroit meille:\n${yhteenvetoRivit}\n\n` : '') +
    `Olemme sinuun yhteydessä mahdollisimman pian.\n\n---\n` +
    `Tämä on automaattinen sähköpostiviesti, ethän vastaa suoraan tähän viestiin.\n` +
    `Jos sinulla on kysyttävää, otathan yhteyttä asiakaspalveluumme: ${asetukset.asiakaspalveluSahkoposti}\n\n` +
    `Ystävällisin terveisin,\n${yritysNimi}`;

  await transporter.sendMail({
    from: `"${yritysNimi}" <${asetukset.gmailUser}>`,
    to: sahkoposti,
    subject: `Kiitos yhteydenotostasi${etunimi ? ', ' + etunimi : ''}!`,
    text: runko,
    replyTo: asetukset.asiakaspalveluSahkoposti,
  });
}

// Reitti: tallentaa tarjouspyynnön HubSpotiin, omina kenttinään
app.post('/api/tarjous', async (req, res) => {
  try {
    const {
      nimi, puhelin, sahkoposti, osoite, postinumero, viesti, palvelu,
      kotityyppi, koko, remontit, budjetti, huoneet, ominaisuudet, aikataulu, varattuAika,
    } = req.body;

    if (!sahkoposti) {
      return res.status(400).json({ virhe: 'Sähköposti puuttuu, HubSpot vaatii sen kontaktin tunnisteeksi' });
    }

    const [etunimi, ...loput] = (nimi || '').split(' ');
    const sukunimi = loput.join(' ');

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

    const luontiVastaus = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers,
      body: JSON.stringify(kontaktinTiedot),
    });

    if (luontiVastaus.status === 409) {
      await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(sahkoposti)}?idProperty=email`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(kontaktinTiedot),
      });
    } else if (!luontiVastaus.ok) {
      const virheteksti = await luontiVastaus.text();
      console.error('HubSpot-virhe:', virheteksti);
      return res.status(500).json({ virhe: 'HubSpot-tallennus epäonnistui' });
    }
    const asetukset = asiakasAsetukset[req.body.asiakas];
    if (asetukset) {
      try {
        await laheteVahvistusEmail({ nimi, sahkoposti, viesti, asetukset });
      } catch (sposti_virhe) {
        console.error('Vahvistussähköpostin lähetys epäonnistui:', sposti_virhe);
      }
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