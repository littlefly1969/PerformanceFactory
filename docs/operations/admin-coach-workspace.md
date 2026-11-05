# Area operativa amministratore e coach

L'amministratore lavora in una pagina estesa per PC: navigazione laterale
raggruppata, intestazione compatta, riepiloghi e liste in tabella. Sotto 760 px
il menu si apre dal pulsante Menu; le tabelle scorrono nel proprio contenitore.
Il percorso dell'atleta e il manifest PWA non cambiano.

## Elenchi operativi

`DataTable` offre ricerca su tutti i record caricati, ordinamento numerico o
alfabetico, 25/50/100 righe per pagina, densità regolabile e intestazioni fisse.
I dettagli si aprono dal pulsante + e contengono le operazioni sul record.
Si usano gli endpoint esistenti: ricerca, ordinamento e paginazione sono locali,
non una paginazione del server. Per volumi che richiedano caricamento parziale
servirà una modifica API da concordare separatamente.

| Pagina               | Operazioni                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin / Operazioni   | Ricerca e gestione assegnazioni degli atleti; restano le code AI e le conferme di reset/eliminazione                                         |
| Admin / Circoli      | Ricerca, stato, ordinamento, dettagli con anagrafica, immagini e attivazione; creazione raccolta in un pannello apribile                     |
| Admin / Lezioni      | Calendario filtrabile per circolo, giorno e stato; assegnazione coach, composizione gruppi, richieste, creazione e annullamento con conferma |
| Coach / Atleti       | Ricerca, revisioni pendenti, selezione e profilo; una risposta tardiva non sostituisce il profilo dell'ultimo atleta selezionato             |
| Coach / Approvazioni | Elenco per atleta con conteggi; contenuto e azioni di revisione nei dettagli                                                                 |
| Coach / Allenamenti  | Elenco piani con avanzamento; esercizi, feedback e pubblicazione nei dettagli                                                                |
| Coach / Lezioni      | Ricerca per circolo e partecipante, stato, gruppo, feedback e assenze nei dettagli                                                           |

Anche le altre pagine admin e coach usano lo stesso contenitore, navigazione,
tipografia e controlli. Autenticazione, ruoli e validazioni del backend restano
quelle esistenti; nessuna azione cumulativa aggira le autorizzazioni del server.

## Codice storico rimosso

- Catalogo manuale dei micro-test dal pannello lezioni: il percorso attuale
  riceve i micro-test dell'AI. Rimossi componente, form, tipi UI non più letti
  e controllo dei crediti del catalogo storico. Il valore salvato viene conservato
  quando si aggiornano gli altri parametri: il contratto API non viene alterato.
- Vecchio editor dell'indirizzo atleta, relativo componente, CSS e test esclusivi:
  non esisteva più una pagina che lo usasse. `/account/indirizzo` continua a
  reindirizzare all'account. L'attuale ricerca per CAP/città del circolo resta.
- CSS delle vecchie schede della lista atleti coach, non più renderizzate.
- Il marchio SVG PF è estratto in un componente condiviso: la navigazione del
  back office non importa il contenitore e gli stili del funnel per mostrarlo.

Nessuna tabella, migrazione o API storica viene eliminata. Dati ed endpoint
possono avere consumatori esterni al frontend e richiedono una decisione distinta.
Le pagine Community/Invita sono ancora raggiungibili e non sono codice morto:
non sono state cancellate automaticamente.

## Verifica

I test coprono ricerca/paginazione su liste estese, ordinamento, riduzione della
lista dopo un filtro, apertura dettagli, navigazione per ruolo, assegnazione
di coach e atleta, creazione, annullamento confermato e conservazione dei crediti
storici. Restano le suite del funnel, account, prenotazione e pagamento.

I test dell'editor indirizzo rimosso sono stati eliminati insieme al componente;
i test dell'account e del redirect/menu attuale rimangono. La diminuzione di quei
test non indica una riduzione della copertura del percorso attuale.
