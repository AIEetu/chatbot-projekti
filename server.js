require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const yritystiedot = fs.readFileSync('yritystiedot.txt', 'utf8');

app.post('/api/chat', async (req, res) => {
  try {
    const kysymys = req.body.kysymys;

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

const PORT = 3000;
app.listen(PORT, () => console.log(`Palvelin käynnissä: http://localhost:${PORT}`));