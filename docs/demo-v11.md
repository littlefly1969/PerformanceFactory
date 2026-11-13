# Allineamento alla demo V11

Riferimento: demo `performance-factory-v11` (cartella del progetto), confrontata
con l'app il 13 novembre 2026. L'analisi completa e la suddivisione in quattro PR
sono nelle note del progetto (`notes/demo-v11-analisi.md`). Questo documento
descrive cosa è stato realizzato, una PR alla volta.

## PR 1 · Funnel e benvenuto (solo web, più un flag)

### Funnel

- **Campo animato.** Quattro giocatori; la pallina vola dritta da un giocatore
  all'altro (lontano a destra, vicino a sinistra, lontano a sinistra, vicino a
  destra), senza fermarsi a rete. Il «pallonetto» è solo l'ingrandimento a metà
  volo. Un anello lime si accende sul giocatore che colpisce. Ciclo di 4 secondi.
- **Sempre in loop.** Ogni domanda monta il suo campo, ma tutti leggono lo stesso
  orologio (`courtShift` in `padel-court.tsx`): le animazioni partono spostate
  del tempo già passato (`--pf4-court-shift`, ritardo negativo), così lo scambio
  continua da dove era. Dopo il primo ingresso (2,2 s) le linee non si
  ritracciano più (`is-settled`).
- **Minigioco «Prova il ritmo».** Resta nel codice, dietro il flag
  `funnel_rhythm_game`, per ora spento: senza flag l'intro mostra solo il campo.
  La zona di colpo è ora sul giocatore vicino a sinistra, a metà scambio.
- **Frequenza.** Sul contatore degli allenamenti niente più fascia in grigio
  («3-4 volte»): solo il numero fra − e +. La fascia resta per i lettori di
  schermo ed è sempre la risposta salvata. L'esperienza la tiene.
- **«Continua» fisso.** Nelle domande con il campo, intestazione e campo restano
  fermi; le risposte scorrono dentro il foglio e il pulsante resta in fondo con
  una sfumatura sopra. Le domande con il quadrante numerico restano come prima
  (la tastiera del telefono coprirebbe il campo).

### Benvenuto

- **Slide 3 · La tua performance.** «Qui troverai la tua performance.», con
  l'esagono, le sei aree scritte intorno (nome breve) e la legenda. Prima
  dell'assessment il reale è la stima fatta con le risposte del funnel
  (`GET /athlete-journey/estimate`); il potenziale non esiste ancora, quindi la
  legenda dice «Potenziale · dopo l'assessment» e non lo disegna.
- **Doppio tocco.** Su intestazione e piede delle slide un tocco arrivato su
  un'altra slide entro 650 ms dal precedente si ignora (`tap-guard.ts`): il
  secondo tocco di un doppio tocco su «Salta» della slide 4 non salta più la 5.
  I tocchi sulla stessa slide non sono toccati.
- **«Sei dentro, {nome}.»** Dopo la slide 5 («Più tardi», «Continua nel
  browser», «Continua») c'è la schermata scura con l'anello e la spunta,
  «Profilo creato» e «Entra nell'app», che porta alla home. Il nome arriva da
  `GET /athlete-journey/profile`; senza nome il titolo è «Sei dentro.». Aperta
  dall'app già installata la slide 5 porta ancora dritta alla home.
