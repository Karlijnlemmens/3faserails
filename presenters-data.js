/* Welke presenter-PDF's beschikbaar zijn voor de PDF-export van de Railconfigurator.

   Dit bestand wordt gegenereerd door tools/maak-presenters.mjs - pas het niet met de
   hand aan. Zet de PDF's in presenters-bron/ en draai:

       node tools/maak-presenters.mjs

   De presenters zelf staan als los bestand in presenters/<id>.js en worden pas
   ingeladen op het moment dat er een PDF wordt gemaakt (zie presenterData() in
   index.html). Zo blijft de tool snel openen, ook met tientallen MB aan presenters.

   PRESENTER_DATA blijft bestaan voor presenters die je liever direct hier inplakt;
   die worden bij het openen al meegeladen en gaan voor op het losse bestand. */
window.PRESENTER_FILES = [
  'achterpaginas',   /* AB Achterpaginas */
  'ag01',   /* Punto */
  'ag02',   /* Piccolo */
  'ag03',   /* Dio */
  'ag04',   /* Alto */
  'ag05',   /* Skyline */
  'ag06',   /* Arda */
  'ag07',   /* Orion */
  'ag08',   /* Notra */
  'ag09',   /* Ario */
  'ag10',   /* Lustra */
  'ag11',   /* Fendi */
  'ag12',   /* Altoflood */
  'ag13',   /* Paneel Essence G3 */
  'ag14',   /* Downlight Essence G2 */
  'ag15',   /* Mondial Pir */
  'ag16',   /* Bandraster Miro */
  'ag17',   /* Downlight Essence Pir */
  'ag18',   /* Downlight Essence Ugr */
  'ag19',   /* Downlight Fora IP65 */
  'ag20',   /* Downlight Mado */
  'ag21',   /* Downlight Mondial */
  'ag22',   /* Downlight Spectre */
  'ag23',   /* In-/Opbouw Downlight Luna G2 */
  'ag24',   /* Mondial Nood */
  'ag25',   /* Mondial Opbouw Pendel */
  'ag26',   /* Mondial Track */
  'ag27',   /* Opbouw Downlight Relio */
  'ag28',   /* Paneel Conto */
  'ag29',   /* Paneel Easy G2 */
  'ag30',   /* Paneel Flexcore */
  'ag31',   /* Paneel Modul */
  'ag32',   /* Paneel Optic */
  'ag33',   /* Paneel Rondix */
  'ag34',   /* Paneel Sigma G2 */
  'ag35',   /* Paneel Wingar */
  'ag36',   /* BRIQ */
  'ag37',   /* Inbouwspot Alpha */
  'ag38',   /* Inbouwspot Apollo Round */
  'ag39',   /* Lumio */
  'ag40',   /* Noodverlichting Dot */
  'ag41',   /* Noodverlichting Uni */
  'ag42',   /* Waterdicht Hermes */
  'ag43',   /* Module Mico */
  'lichtlijn-prxline',   /* Lichtlijn PRX-Line */
  'lichtlijn-retroline',   /* Lichtlijn Retroline PRX */
  'lichtlijn-uniline',   /* Lichtlijn PRX-Uniline */
  'rail',   /* 3-Fase Rail */
];
window.PRESENTER_DATA = window.PRESENTER_DATA || {};
