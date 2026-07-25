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

app.post('/api/chat', async (req, res) => {
  try {
    const kysymys = req.body.kysymys;
    const asiakas = req.body.asiakas || 'turun-lukko';

    // Valitaan oikea API-avain asiakkaan mukaan
    const avaimet = {
      'turun-lukko': process.env.OPENAI_API_KEY_TURUN_LUKKO,
      'auto-mauno': process.env.OPENAI_API_KEY_AUTO_MAUNO,
    };
    const apiAvain = avaimet[asiakas];

    if (!apiAvain) {
      return res.status(404).json({ virhe: 'API-avainta ei löydy asiakkaalle: ' + asiakas });
    }

    const openai = new OpenAI({ apiKey: apiAvain });

    const tiedostoPolku = path.join(__dirname, 'asiakkaat', `${asiakas}.txt`);

    if (!fs.existsSync(tiedostoPolku)) {
      return res.status(404).json({ virhe: 'Asiakasta ei löydy: ' + asiakas });
    }

    const yritystiedot = fs.readFileSync(tiedostoPolku, 'utf8');

    const vastaus = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Olet asiakaspalvelubotti. Vastaa kysymyksiin VAIN alla olevan yritystiedon perusteella. Jos et löydä vastausta tiedoista, sano ettet tiedä.

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