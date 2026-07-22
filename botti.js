require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Luetaan tiedoston sisältö
const yritystiedot = fs.readFileSync('yritystiedot.txt', 'utf8');

async function kysyBotilta(kysymys) {
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

  console.log(vastaus.choices[0].message.content);
}

kysyBotilta("Mitä palvelunne maksavat?");