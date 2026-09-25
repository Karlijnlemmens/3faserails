/* De medewerkers die op de briefingpagina van het armaturenboek kunnen staan: onder
   "Contactgegevens" de projectuitwerker, de accountmanager en de commerciële
   binnendienst die bij het project horen, en onder "Onze specialist" het blauwe vlak
   met de foto en de persoonlijke noot van de projectuitwerker - als die er een heeft.

   Bron: "Contactgegevens - Update sep 2026.pdf". De teksten zijn overgenomen zoals ze
   in dat document op de pagina staan; de tekstlaag van de PDF had woorden gebroken
   ("mi jn", "insta llateur") en bij twee noten een dubbel aanhalingsteken.

   Dit bestand is met de hand bij te houden:
   - id        kort en uniek binnen zijn lijst; bij een projectuitwerker met foto ook de
               bestandsnaam van de foto (docs/bronnen/medewerkers/<id>.jpg, zie
               tools/maak-medewerker-fotos.mjs)
   - functie   zoals in de contactgegevens; kaartFunctie zoals op het blauwe vlak, als
               die anders geschreven wordt ("Lichtadviseur / Lichtplanner")
   - tel       het directe nummer; het algemene nummer staat hieronder één keer
   - mobiel    alleen als het in de bron staat
   - noot      de persoonlijke noot zonder aanhalingstekens; een regeleinde (\n) is een
               nieuwe alinea. Zonder noot geen blauw vlak, alleen de contactgegevens.
   - rond      de foto is in de bron al rond uitgesneden op een blauw vlak; de PDF
               knipt hem dan rond, zodat dat blauw niet als vierkant zichtbaar wordt.

   De repo is openbaar: alles in dit bestand staat ook op GitHub en de website. Dat is
   met de gebruiker afgesproken (september 2026). */
window.MEDEWERKERS = {
  algemeen: '040 209 49 00',

  projectuitwerkers: [
    {id:'jose', naam:'Jose Herrero', functie:'Head of Projects & Engineering',
     tel:'040 209 49 21', mobiel:'061 033 98 24', email:'jose@distrilight.com',
     noot:'Bij Distrilight hebben we een passie voor het creëren van slimme, duurzame lichtoplossingen. '
       + 'Ik begeleid projecten van concept tot realisatie en zorg voor een vlotte samenwerking tussen '
       + 'alle betrokken partijen. Met oog voor detail en functionaliteit streef ik ernaar om elke ruimte '
       + 'tot leven te brengen met de juiste verlichting.'},
    {id:'harrie', naam:'Harrie van der Linden', functie:'Lichtadviseur/Lichtplanner',
     kaartFunctie:'Lichtadviseur / Lichtplanner',
     tel:'040 209 49 22', email:'harrie@distrilight.com',
     noot:'Bij Distrilight geloven we in “samen”. Immers, het is ook in ons belang dat u die opdracht '
       + 'scoort. Wij willen óók dat u met een goed en onderbouwd lichtplan naar uw opdrachtgevers gaat, '
       + 'zodat u die deal kunt maken. Mijn licht-technische specialisatie en mijn elektrotechnische '
       + 'achtergrond, ook op de werkvloer, komen daarbij goed van pas. Mijn gevoel voor vorm en '
       + 'verhoudingen, functie en beleving, creativiteit en efficiëntie draagt bij aan effectieve '
       + 'lichtplannen die een blijvende indruk maken op uw opdrachtgevers.'},
    {id:'iris', naam:'Iris Braan', functie:'Lichtadviseur/Lichtplanner',
     kaartFunctie:'Lichtadviseur / Lichtplanner',
     tel:'040 209 49 23', email:'iris@distrilight.com',
     noot:'Als lichtontwerper bij Distrilight is mijn doel om installateurs te ontzorgen en te '
       + 'ondersteunen met doordachte, praktische oplossingen gedurende het hele traject.\n'
       + 'Met enthousiasme en betrokkenheid werk ik aan heldere concepten waarin kwaliteit en '
       + 'samenwerking centraal staan. Zo zorg ik ervoor dat ieder lichtplan perfect aansluit bij de '
       + 'wensen van de klant én de praktijk.'},
    {id:'karlijn', naam:'Karlijn Lemmens', functie:'Lichtadviseur/Lichtplanner',
     kaartFunctie:'Lichtadviseur / Lichtplanner',
     tel:'040 209 49 24', email:'karlijn@distrilight.com', rond:true,
     noot:'Als lichtadviseur bij Distrilight vind ik het interessant om te ontdekken hoe de juiste '
       + 'verlichting een ruimte kan versterken. Ik vertaal de wensen van de klant naar doordachte '
       + 'lichtplannen waarin functionaliteit, uitstraling en technische haalbaarheid samenkomen.\n'
       + 'Met een praktische en betrokken aanpak ondersteun ik installateurs gedurende het hele '
       + 'traject. Zo werk ik samen aan lichtoplossingen die niet alleen goed ontworpen zijn, maar '
       + 'ook in de praktijk kloppen.'},
    {id:'luuk', naam:'Luuk Stavenuiter', functie:'Lichtadviseur/Lichtplanner',
     kaartFunctie:'Lichtadviseur / Lichtplanner',
     tel:'040 209 49 25', email:'luuk@distrilight.com',
     noot:'Als lichtadviseur en lichtplanner bij Distrilight richt ik mij volledig op het ondersteunen '
       + 'van de installateur bij hun verlichtingsprojecten. Door veel aandacht te besteden aan de wensen '
       + 'van de klant kom ik met creatieve en praktische oplossingen die goed passen bij het project. '
       + 'Met onze servicegerichte aanpak kunnen wij onze klanten zoveel mogelijk ontzorgen en zetten '
       + 'wij samen een mooi resultaat neer.'},
    {id:'christophe', naam:'Christophe Canoy', functie:'Projectmanager',
     tel:'040 209 49 26', mobiel:'062 714 11 90', email:'christophe@distrilight.com',
     noot:'Bij Distrilight ben ik bij veel projecten betrokken van groot tot klein. Hierbij overleg ik '
       + 'graag met de installateur om een goed plan te presenteren, waar zowel de installateur, '
       + 'opdrachtgever als Distrilight achter staan. Dit begint al bij de aanvraag met het '
       + 'inventariseren van de behoeften en wensen. Na de opdracht ga ik hier graag mee aan de slag '
       + 'om te zorgen voor een goede begeleiding van assemblage en logistiek, ook dat is van groot '
       + 'belang voor een tijdige oplevering.'},
    /* nog geen foto en noot: alleen de contactgegevens */
    {id:'olivia', naam:'Olivia Askew', functie:'Lichtadviseur/Lichtplanner',
     tel:'040 209 49 27', email:'olivia@distrilight.com'},
    {id:'julia', naam:'Julia Versteden', functie:'Lichtadviseur/Lichtplanner',
     tel:'040 209 49 28', email:'julia@distrilight.com'},
  ],

  accountmanagers: [
    {id:'tiemen',  naam:'Tiemen Hasselo', functie:'Accountmanager Noord-Oost',
     tel:'040 209 49 02', mobiel:'062 538 61 81', email:'tiemen@distrilight.com'},
    {id:'jorick',  naam:'Jorick van Iterson', functie:'Accountmanager Zuid',
     tel:'040 209 49 11', email:'jorick@distrilight.com'},
    {id:'metin',   naam:'Metin Ergin', functie:'Accountmanager',
     tel:'040 209 49 02', email:'metin@distrilight.com'},
    {id:'marianne', naam:'Marianne Smolders', functie:'Accountmanager',
     tel:'040 209 49 06', email:'marianne@distrilight.com'},
    {id:'luuk-eerden', naam:'Luuk Eerden', functie:'Accountmanager',
     tel:'040 209 49 09', mobiel:'061 171 81 85', email:'l.eerden@distrilight.com'},
    {id:'luuk-eerden-bd', naam:'Luuk Eerden', functie:'Business Developer',
     tel:'040 209 49 09', email:'l.eerden@distrilight.com'},
    {id:'sven-heumen', naam:'Sven Heumen', functie:'Business Developer',
     tel:'040 209 49 10', email:'sven.heumen@distrilight.com'},
    {id:'sven', naam:'Sven van Dijk', functie:'Commercieel Manager',
     tel:'040 209 49 05', mobiel:'062 144 39 91', email:'sven@distrilight.com'},
    {id:'fatih', naam:'Fatih Ünlü', functie:'Directeur',
     tel:'040 209 49 21', mobiel:'061 832 56 59', email:'fatih@distrilight.com'},
  ],

  binnendienst: [
    {id:'hilde',  naam:'Hilde van den Oever', functie:'Commerciële Binnendienst',
     tel:'040 209 49 03', email:'hilde@distrilight.com'},
    {id:'steffy', naam:'Steffy Manders', functie:'Commerciële Binnendienst',
     tel:'040 209 49 13', email:'steffy@distrilight.com'},
    {id:'christophe', naam:'Christophe Canoy', functie:'Hoofd Commerciële Binnendienst',
     tel:'040 209 49 26', mobiel:'062 714 11 90', email:'christophe@distrilight.com'},
  ],
};

/* De drie rollen, in de volgorde waarin ze naast elkaar op de pagina staan. */
window.MEDEWERKER_ROLLEN = [
  {id:'projectuitwerker', label:'Projectuitwerker',        lijst:'projectuitwerkers'},
  {id:'accountmanager',   label:'Accountmanager',          lijst:'accountmanagers'},
  {id:'binnendienst',     label:'Commerciële binnendienst', lijst:'binnendienst'},
];
