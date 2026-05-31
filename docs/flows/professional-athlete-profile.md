# Profilo performance atleta per professionisti

Il profilo performance in area professionista usa una sola pagina di lettura:

- snapshot corrente con radar e valori R/P;
- progressione degli snapshot storici;
- storico cicli, dove lavori e questionari collegati sono mostrati nello stesso blocco.

## Regole di accesso

Un professionista collegato per area vede il profilo filtrato sulle aree assegnate e sui driver abilitati della specializzazione dell'atleta.

Un allenatore collegato tramite `CoachUserLink` vede invece il profilo performance complessivo dell'atleta. La vista include tutte le aree presenti negli snapshot e puo caricare lo storico lavori/questionari per ogni area del profilo, anche se l'allenatore non ha un `ProfessionalUserLink` su quelle aree.

Questa distinzione e intenzionale: l'allenatore gestisce l'allenamento specifico sport-specializzazione, ma per valutarlo deve leggere il quadro complessivo dell'atleta.
