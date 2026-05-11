ALTER TABLE "SportSpecialization"
  ADD COLUMN "trainingPrompt" TEXT,
  ADD COLUMN "trainingPromptVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "trainingPromptActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "SportSpecializationAreaPrompt"
  ADD COLUMN "isEnabledDriver" BOOLEAN NOT NULL DEFAULT true;

UPDATE "SportSpecialization" specialization
SET "trainingPrompt" = CONCAT(
  'Genera l allenamento specifico per ', sport."label", ' - ', specialization."label", '. ',
  'Usa obiettivo, anamnesi, storico, carico e segnali di recupero. ',
  'Produci un lavoro pratico, progressivo, misurabile e revisionabile da un professionista.'
)
FROM "Sport" sport
WHERE sport."id" = specialization."sportId"
  AND specialization."trainingPrompt" IS NULL;

UPDATE "SportSpecialization" specialization
SET
  "trainingPrompt" = $prompt$
[Prompt Allenamento Corsa - Strada v1]

Adatta la generazione dell'allenamento allo scenario sportivo Corsa - Strada.

Questo prompt non appartiene all'area Preparazione atletica complementare. Deve generare allenamenti veri e propri di corsa su strada: sedute operative, microcicli o progressioni finalizzate al miglioramento della performance nella corsa, in base all'obiettivo configurato e al contesto atleta disponibile.

Usa la scelta "Corsa - Strada" come vincolo prioritario per interpretare obiettivo, anamnesi, risposte dell'atleta, note, punteggi, lavori assegnati, completamenti, rifiuti, feedback, istruzioni configurate dall'amministratore, limiti di sicurezza, indicatori di monitoraggio e regole di progressione.

Usa obbligatoriamente tutto e solo il contesto fornito nei blocchi successivi. Non chiedere nuove informazioni preliminari. Non inventare dati mancanti.

La proposta deve essere un allenamento reale di corsa su strada, non una lista generica di esercizi fisici. Deve indicare cosa deve fare l'atleta durante la seduta o nel periodo richiesto, con struttura chiara, intensita, volume, recuperi, criteri di successo e progressione.

Quando l'obiettivo riguarda 5 km, 10 km, mezza maratona, maratona o endurance running, costruisci l'allenamento in modo coerente con la distanza, il livello di informazioni disponibili, la tolleranza al carico, l'anamnesi e la frequenza di allenamento eventualmente indicata.

Gli allenamenti possono includere, quando pertinenti:
- fondo lento;
- corsa facile;
- corsa rigenerante;
- lungo lento;
- medio;
- progressivo;
- fartlek;
- ripetute brevi;
- ripetute medie;
- ripetute lunghe;
- lavori a ritmo gara;
- salite, solo se coerenti con il contesto;
- sedute di recupero;
- settimane di scarico;
- progressione del volume;
- progressione dell'intensita;
- combinazioni prudenti di corsa e recupero attivo.

Non trasformare l'allenamento in preparazione atletica complementare. Core stability, forza, mobilita e prevenzione possono essere citati solo come eventuale supporto secondario se previsto dal contesto, ma il contenuto principale deve essere la seduta di corsa.

Non inventare passo gara, ritmo al km, frequenza cardiaca, zone, soglie, FTP, VO2max, chilometraggio settimanale, disponibilita settimanale, livello atletico, storico infortuni, test o attrezzatura se non sono presenti nel contesto.

Se sono disponibili ritmi, zone cardiache, test recenti, passo gara, RPE, chilometraggio o frequenza settimanale, usali per rendere l'allenamento piu preciso.

Se ritmi, zone o test non sono disponibili, usa parametri prudenti e osservabili come:
- durata;
- distanza controllata;
- RPE;
- capacita di parlare durante la corsa;
- recupero percepito;
- assenza di dolore;
- qualita del movimento;
- regolarita del passo;
- recupero entro il giorno successivo.

La progressione deve rispettare la logica della corsa su strada:
1. prima consolidare regolarita e tolleranza al carico;
2. poi aumentare gradualmente il volume;
3. poi inserire intensita controllata;
4. poi aumentare specificita verso la distanza obiettivo;
5. evitare aumenti simultanei di volume, intensita e complessita.

Se il contesto indica mezza maratona o maratona, privilegia continuita aerobica, lunghi progressivi, gestione del ritmo, capacita di sostenere il carico, recupero tra sedute e progressione sostenibile. Non proporre lavori massimali o eccessivamente intensi se il contesto non li giustifica.

Se il contesto indica fastidi, infortuni precedenti, dolore, problemi alla schiena, sovraccarichi, affaticamento elevato o recupero insufficiente, riduci volume, intensita e complessita. In questi casi privilegia corsa facile, durata controllata, recuperi ampi, monitoraggio della risposta e progressione conservativa.

Ogni allenamento deve essere strutturato in modo operativo e deve includere:
- obiettivo della seduta;
- riscaldamento;
- parte centrale;
- defaticamento;
- intensita;
- volume totale o durata totale;
- recuperi, se presenti;
- criterio misurabile di successo;
- progressione consigliata;
- segnali per ridurre o interrompere il lavoro.

L'intensita deve essere indicata con il parametro piu affidabile disponibile nel contesto:
- ritmo al km, se fornito;
- frequenza cardiaca o zone, se fornite;
- RPE, se non sono disponibili dati piu precisi;
- descrizione percettiva prudente, se non sono presenti metriche oggettive.

I criteri di successo devono essere concreti e misurabili, ad esempio:
- completare la seduta senza dolore;
- mantenere RPE entro il range indicato;
- mantenere ritmo regolare;
- chiudere la seduta senza calo marcato;
- recuperare entro 24 ore;
- non peggiorare fastidi riferiti;
- completare il volume previsto senza aumentare la fatica oltre il limite indicato;
- mantenere buona qualita di corsa nella parte finale.

Le progressioni devono essere semplici, verificabili e coerenti con il contesto, ad esempio:
- aumentare la durata di pochi minuti;
- aumentare la distanza solo se il recupero e buono;
- aggiungere una ripetizione solo se la seduta precedente e stata completata senza segnali negativi;
- mantenere invariata l'intensita aumentando prima la continuita;
- inserire ritmo gara solo dopo consolidamento del fondo;
- ridurre il carico se compaiono dolore, affaticamento anomalo o recupero insufficiente.

Non generare piani aggressivi. Non proporre incrementi arbitrari. Se il contesto amministratore indica limiti specifici, come incremento massimo settimanale, priorita al volume prima dell'intensita o adattamento basato su assenza di dolore, tali limiti prevalgono sempre.

Se devi generare una singola seduta, produci una seduta completa e immediatamente eseguibile.

Se devi generare un microciclo settimanale, distribuisci le sedute in modo coerente con frequenza disponibile, recupero, obiettivo e anamnesi. Non inventare giorni o frequenza se non sono forniti: in quel caso genera solo la prossima seduta o una proposta modulare adattabile.

Se devi generare una progressione verso mezza maratona o maratona, organizza il lavoro in blocchi progressivi, rispettando carico, recupero, settimane di scarico e specificita crescente verso la distanza obiettivo.

Le domande di monitoraggio, se richieste dallo schema, non devono raccogliere dati preliminari generici. Devono servire a valutare la risposta alla seduta proposta, ad esempio:
- dolore o fastidio durante/dopo la corsa;
- livello di fatica percepita;
- qualita del recupero;
- risposta della schiena, se pertinente;
- risposta di polpacci, tendini, ginocchia, anche o piedi;
- capacita di completare il lavoro mantenendo il ritmo o l'RPE previsto;
- impatto sulla seduta successiva.

Rispondi solo in italiano e solo con JSON valido conforme allo schema richiesto.

La risposta deve contenere una proposta di allenamento reale per Corsa - Strada, coerente con obiettivo, anamnesi, istruzioni configurate e dati disponibili.

Non inserire diagnosi, consigli medici, trattamenti riabilitativi specialistici o dati non presenti nel contesto. In presenza di segnali critici gia indicati, mantieni la proposta conservativa e rimanda alla valutazione di un professionista qualificato.

Schema JSON consigliato per questo modulo

{
  "stato_conoscenza_profilo_atleta": "",
  "sintesi": "",
  "tipo_output": "singola_seduta | microciclo | progressione",
  "obiettivo_allenamento": "",
  "allenamento": {
    "titolo": "",
    "tipo_seduta": "",
    "durata_totale": "",
    "volume_totale": "",
    "riscaldamento": {
      "descrizione": "",
      "durata": "",
      "intensita": ""
    },
    "parte_centrale": {
      "descrizione": "",
      "serie_o_blocchi": "",
      "recuperi": "",
      "intensita": ""
    },
    "defaticamento": {
      "descrizione": "",
      "durata": "",
      "intensita": ""
    },
    "criterio_successo": "",
    "progressione": "",
    "segnali_riduzione_o_stop": ""
  },
  "monitoraggio": [
    "",
    "",
    ""
  ]
}
$prompt$,
  "trainingPromptVersion" = "trainingPromptVersion" + 1,
  "trainingPromptActive" = true
FROM "Sport" sport
WHERE sport."id" = specialization."sportId"
  AND (
    LOWER(sport."label") IN ('corsa', 'running')
    OR LOWER(sport."key") IN ('corsa', 'running', 'run')
  )
  AND (
    LOWER(specialization."label") IN ('strada', 'road')
    OR LOWER(specialization."key") IN ('strada', 'road')
  );
