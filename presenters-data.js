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
  'ag01',   /* Punto */
];
window.PRESENTER_DATA = window.PRESENTER_DATA || {};
