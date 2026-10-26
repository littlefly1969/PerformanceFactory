/**
 * Lo sport della piattaforma è il padel, e solo il padel. I modelli, lasciati
 * liberi, scivolano sul tennis (corde e incordatura, singolare, superfici,
 * colpi da fondo senza pareti): è un errore visibile all'atleta e rende la
 * domanda inutile per la valutazione del driver.
 *
 * Questa regola è fissa: va aggiunta ai vincoli di formato di ogni prompt
 * rivolto all'atleta, così vale anche quando l'AI Tuner ha attivato un prompt
 * che non nomina lo sport.
 */
export const PADEL_SPORT_RULE = [
  '- SPORT: padel, e solo padel. Campo da 10x20 con pareti e rete metallica, gioco di coppia, battuta dal basso sotto la vita, pala senza corde. Ogni situazione di gioco, esercizio, soglia e termine tecnico è di padel.',
  '- Lessico ammesso: pala, bandeja, víbora, smash (per 3, per 4), volée, dejada, globo, uscita di parete (laterale, di fondo, doppia parete), contro-parete, rete, posizione di coppia, scambio a rete, servizio e risposta al servizio.',
  '- Vietato ogni contenuto da tennis o da altri sport di racchetta: corde, incordatura, tensione, overgrip come sostituto delle corde, singolare, break e turni di servizio dal tennis, superfici (terra, erba), top spin da fondo senza pareti, smorzate da tennis, racchetta al posto della pala. Se un argomento non ha senso nel padel, non chiederlo: scegli un altro aspetto dello stesso driver.',
  '- Anche sui driver non tecnici (preparazione, mental, nutrizione, attrezzatura, fisioterapia) il contesto resta il padel: scatti brevi e cambi di direzione in un campo chiuso, partite e tornei di coppia, pala e scarpe da padel.',
].join('\n');
