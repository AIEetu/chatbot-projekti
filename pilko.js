function pilkoTeksti(teksti, palanKoko = 500) {
  const kappaleet = teksti.split(/\n\s*\n/); // pilkotaan tyhjien rivien kohdalta
  const palat = [];
  let nykyinen = "";

  for (const kappale of kappaleet) {
    if ((nykyinen + kappale).length > palanKoko) {
      if (nykyinen) palat.push(nykyinen.trim());
      nykyinen = kappale;
    } else {
      nykyinen += "\n\n" + kappale;
    }
  }
  if (nykyinen) palat.push(nykyinen.trim());
  return palat;
}

module.exports = { pilkoTeksti };