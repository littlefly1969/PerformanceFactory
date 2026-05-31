# Esperienza atleta: attivita e check-in

L'esperienza atleta separa lavoro operativo e misurazione.

## Attivita

La pagina `/user/plan` e il punto unico per le attivita da completare:

- **Percorso sportivo**: lavoro complessivo generato per sport e specializzazione. Usa il contesto delle aree abilitate, ma non e un lavoro di area.
- **Lavori per area**: attivita operative collegate a una singola area performance.

I due blocchi convivono nella stessa pagina per ridurre la navigazione, ma restano distinti nel titolo, nel contesto e nelle azioni.

La vecchia route `/user/training` rimane compatibile e reindirizza a `/user/plan`.

## Check-in

La pagina `/user/questions` raccoglie solo misurazioni:

- check-in del percorso sportivo;
- check-in per area.

I check-in non sono mostrati dentro le attivita, per evitare che l'atleta confonda completamento del lavoro e misurazione del ciclo.

## Naming UX

Nel frontend atleta:

- evitare "allenamento" come termine generico;
- usare "percorso sportivo" per il piano sport/specializzazione;
- usare "lavori per area" per le attivita area-specifiche;
- usare "check-in" per questionari e monitoraggi.
