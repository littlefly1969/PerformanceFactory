"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Language = "it" | "en";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (value: string) => string;
};

const dictionary: Record<string, string> = {
  PerformanceFactory: "PerformanceFactory",
  "Performance operations": "Operazioni performance",
  "External preview": "Anteprima esterna",
  "Secure access": "Accesso sicuro",
  "One workspace for athletes, professionals, and operations.":
    "Un unico ambiente per atleti, professionisti e gestione operativa.",
  "AI creates proposals, professionals validate quality, and admins publish only when the cycle is ready.":
    "L'AI crea proposte, i professionisti validano la qualità e l'admin pubblica solo quando il ciclo è pronto.",
  "Use a seeded account while the deployment environment is being prepared.":
    "Usa un account demo mentre l'ambiente di deploy viene preparato.",
  "Sign in": "Accedi",
  "Access your workspace": "Accedi al tuo ambiente",
  "Choose a demo role or enter credentials manually.":
    "Scegli un ruolo demo oppure inserisci le credenziali manualmente.",
  Email: "Email",
  Password: "Password",
  "Signing in...": "Accesso in corso...",
  Admin: "Admin",
  Professional: "Professionista",
  Athlete: "Atleta",
  "Professional TT": "Professionista tecnico-tattico",
  "Professional AP": "Professionista preparazione atletica",
  "Professional EQ": "Professionista attrezzatura",
  "Professional PT": "Professionista fisioterapia",
  "Professional NU": "Professionista nutrizione",
  "Professional MT": "Professionista mental training",
  "Credentials are not valid or the API is not reachable.":
    "Credenziali non valide oppure API non raggiungibile.",

  Plan: "Piano",
  Questions: "Questionari",
  Performance: "Performance",
  Approvals: "Approvazioni",
  "AI proposals stay gated by professional review and admin publish.":
    "Le proposte AI restano bloccate fino alla revisione professionale e alla pubblicazione admin.",
  Refresh: "Aggiorna",
  "Refresh setup": "Aggiorna configurazione",
  "Admin workspace": "Ambiente admin",
  "Operations cockpit": "Cruscotto operativo",
  "Prepare athlete-professional relationships, assign area competences, run proposal cycles, and publish only after professional approval.":
    "Prepara relazioni atleta-professionista, assegna competenze per area, avvia cicli di proposta e pubblica solo dopo l'approvazione professionale.",
  Athletes: "Atleti",
  Professionals: "Professionisti",
  "Cycle status": "Stato ciclo",
  "Cycle prerequisites": "Prerequisiti ciclo",
  "Before running a cycle, the athlete must be linked to at least one professional with competence on the selected area.":
    "Prima di avviare un ciclo, l'atleta deve essere collegato ad almeno un professionista competente sull'area selezionata.",
  "Ready to prepare": "Pronto",
  "Missing setup": "Configurazione mancante",
  "Athlete and professional": "Atleta e professionista",
  "Select athlete": "Seleziona atleta",
  "Select professional": "Seleziona professionista",
  "Link athlete to professional": "Collega atleta al professionista",
  "Area competences": "Competenze per area",
  "Select the areas this professional can approve.":
    "Seleziona le aree che questo professionista può approvare.",
  "Select all": "Seleziona tutto",
  "Save competences": "Salva competenze",
  Cycle: "Ciclo",
  "Run all areas or start with a single area while testing.":
    "Avvia tutte le aree oppure una sola area durante i test.",
  "Run proposal": "Avvia proposta",
  Scope: "Ambito",
  "All areas": "Tutte le aree",
  "Prepare and run": "Prepara e avvia",
  "Run only": "Avvia soltanto",
  "Running...": "Avvio in corso...",
  "Publish cycle": "Pubblica ciclo",
  "Cycle id": "ID ciclo",
  "Plan release UUID": "UUID rilascio piano",
  "Check status": "Controlla stato",
  Publish: "Pubblica",
  "Publishing...": "Pubblicazione...",
  "Publish unlocks after all approval gates are complete.":
    "La pubblicazione si sblocca dopo tutte le approvazioni richieste.",
  "Approval readiness": "Prontezza approvazioni",
  "Area-level status for the selected cycle.":
    "Stato per area del ciclo selezionato.",
  Questionnaire: "Questionario",
  "Plan item": "Elemento piano",
  "No cycle loaded": "Nessun ciclo caricato",
  "Run a proposal or paste an existing cycle id to inspect readiness.":
    "Avvia una proposta o incolla un ID ciclo esistente per controllare la prontezza.",

  "Athlete onboarding": "Onboarding atleta",
  "Starter performance questionnaire": "Questionario iniziale di performance",
  "Complete this baseline before opening the athlete workspace. It creates your first spider chart and initial area profile.":
    "Completa questa baseline prima di accedere all'ambiente atleta. Crea il primo grafico spider e il profilo iniziale per area.",
  Status: "Stato",
  Answered: "Risposte",
  Access: "Accesso",
  Locked: "Bloccato",
  Ready: "Pronto",
  "Baseline preview": "Anteprima baseline",
  "The spider appears after saving the starter questionnaire.":
    "Lo spider appare dopo il salvataggio del questionario iniziale.",
  "Create baseline": "Crea baseline",
  "Saving...": "Salvataggio...",
  "Enter workspace": "Entra nell'ambiente",
  "Continue to workspace": "Continua all'ambiente",

  "Athlete workspace": "Ambiente atleta",
  "My performance dashboard": "La mia dashboard performance",
  "A personal view of current profile, active work, open check-ins, and the professional team around the athlete.":
    "Vista personale di profilo corrente, lavoro attivo, check-in aperti e team professionale.",
  "Real average": "Media reale",
  "Potential average": "Media potenziale",
  "Active work": "Lavoro attivo",
  "Performance spider": "Spider performance",
  "Real shows current execution. Potential shows the next reachable level.":
    "Reale mostra l'esecuzione corrente. Potenziale mostra il prossimo livello raggiungibile.",
  "Next actions": "Prossime azioni",
  "What needs attention now.": "Ciò che richiede attenzione ora.",
  "Active plan items": "Elementi piano attivi",
  "Open questionnaires": "Questionari aperti",
  "Open plan": "Apri piano",
  "Answer check-in": "Rispondi al check-in",
  "Area focus": "Focus area",
  "Current state by area with direct access to work and check-ins.":
    "Stato corrente per area con accesso diretto a lavoro e check-in.",
  "No active work": "Nessun lavoro attivo",
  "Not available": "Non disponibile",
  "No areas configured": "Nessuna area configurata",
  "Seed areas before using the athlete workspace.":
    "Carica le aree prima di usare l'ambiente atleta.",

  "Professional workspace": "Ambiente professionista",
  "Athlete intelligence dashboard": "Dashboard intelligence atleta",
  "Monitor linked athletes, read the performance spider, identify the biggest development gap, and jump into reviews only when needed.":
    "Monitora gli atleti collegati, leggi lo spider performance, individua il gap principale e passa alle revisioni solo quando serve.",
  "Linked athletes": "Atleti collegati",
  "Pending selected": "Pending selezionato",
  "Current ranking": "Ranking corrente",
  "Selected athlete": "Atleta selezionato",
  "Performance profile visible only for linked athletes and competent areas.":
    "Profilo performance visibile solo per atleti collegati e aree di competenza.",
  "Coaching focus": "Focus coaching",
  "Highest opportunity area and pending review load.":
    "Area con maggiore opportunità e carico revisioni.",
  "Largest gap": "Gap principale",
  "Review approvals": "Rivedi approvazioni",
  "Full profile": "Profilo completo",
  "No performance snapshot": "Nessuno snapshot performance",
  "The athlete needs to close a published questionnaire before a profile is available.":
    "L'atleta deve chiudere un questionario pubblicato prima che il profilo sia disponibile.",
  Roster: "Roster",
  "Linked athletes available to this professional.":
    "Atleti collegati disponibili per questo professionista.",
  pending: "in attesa",
  "No linked athletes": "Nessun atleta collegato",
  "Link athletes from the admin workspace or seed demo data.":
    "Collega atleti dall'area admin o dai dati demo.",

  Dashboard: "Dashboard",
  "Check-in": "Check-in",
  Operations: "Operazioni",
  workspace: "ambiente",
  Account: "Account",
  "Loading...": "Caricamento...",
  "Exiting...": "Uscita...",
  Logout: "Logout",
  "Workspace navigation": "Navigazione ambiente",
  "Page summary": "Riepilogo pagina",
  "Opening workspace": "Apertura ambiente",
  "No performance profile yet": "Nessun profilo performance disponibile",
  "Close a questionnaire to generate the first spider chart.":
    "Chiudi un questionario per generare il primo spider.",
  Real: "Reale",
  Potential: "Potenziale",
  active: "attive",
  completed: "completate",
  "active work item": "attività attiva",
  "questions ready": "domande pronte",
  questions: "domande",
  question: "domanda",
  questionnaire: "questionario",
  "plan item": "attività",
  "plan items": "attività",
  "AI generation failed": "Generazione AI non riuscita",
  "AI preview failed": "Anteprima AI non riuscita",
  "Publish failed": "Pubblicazione non riuscita",
  "Competence update failed": "Aggiornamento competenze non riuscito",
  "Unable to load approvals": "Impossibile caricare le approvazioni",
  "Question approval failed": "Approvazione questionario non riuscita",
  "Question rejection failed": "Rifiuto questionario non riuscito",
  "Plan item approval failed": "Approvazione attività non riuscita",
  "Plan item rejection failed": "Rifiuto attività non riuscito",

  "AI performance workflow": "Workflow performance AI",
  "Secure workspace": "Ambiente sicuro",
  "Signed in as": "Accesso effettuato come",
  General: "Generale",
  Tactical: "Tecnico-tattico",
  Athletic: "Preparazione",
  Equipment: "Attrezzatura",
  Psychology: "Fisioterapia",
  Nutrition: "Nutrizione",
  Mental: "Mental",

  "Sign in as an athlete to open this workspace.":
    "Accedi come atleta per aprire questo ambiente.",
  "Active performance plan": "Piano performance attivo",
  "Work is organized by area. Areas with active work are highlighted first; open one and complete the assigned activity.":
    "Il lavoro è organizzato per area. Le aree con attività attive sono evidenziate per prime: aprine una e completa l'attività assegnata.",
  "Refresh areas": "Aggiorna aree",
  "Active items": "Attività attive",
  Completed: "Completate",
  "Plan version": "Versione piano",
  Areas: "Aree",
  "Open the area that has work to complete.":
    "Apri l'area che contiene lavoro da completare.",
  "No active plan": "Nessun piano attivo",
  "To do": "Da fare",
  Done: "Completato",
  Empty: "Vuoto",
  "Today's work": "Lavoro di oggi",
  "Complete items only after the activity is actually done.":
    "Completa le attività solo dopo averle svolte davvero.",
  "Completion notes": "Note di completamento",
  "What did you complete?": "Che cosa hai completato?",
  Rating: "Valutazione",
  "Mark complete": "Segna completata",
  "No active work for this area": "Nessuna attività attiva per questa area",
  "Select an area": "Seleziona un'area",
  "There is no published active item for the selected area.":
    "Non ci sono attività attive pubblicate per l'area selezionata.",
  "Choose an area to load the current plan.":
    "Scegli un'area per caricare il piano corrente.",
  "Select an area to load the current plan.":
    "Seleziona un'area per caricare il piano corrente.",
  "Sign in to view your plan.": "Accedi per vedere il tuo piano.",
  "Unable to load the current plan.": "Impossibile caricare il piano corrente.",
  "This item is already completed.": "Questa attività è già completata.",
  "Completion failed.": "Completamento non riuscito.",

  "Area check-ins": "Check-in per area",
  "Questionnaires are grouped by area. Open an area with pending questions, submit answers, then close it to update your profile.":
    "I questionari sono raggruppati per area. Apri un'area con domande pendenti, invia le risposte e poi chiudila per aggiornare il profilo.",
  Progress: "Avanzamento",
  "A highlighted area has a published questionnaire waiting for answers.":
    "Un'area evidenziata ha un questionario pubblicato in attesa di risposte.",
  "No questionnaire": "Nessun questionario",
  "To answer": "Da rispondere",
  "Current check-in": "Check-in corrente",
  "Choose the option that best reflects your current execution.":
    "Scegli l'opzione che descrive meglio la tua esecuzione attuale.",
  "No questionnaire available": "Nessun questionario disponibile",
  "A professional-approved questionnaire has not been published for this area yet.":
    "Per questa area non è ancora stato pubblicato un questionario approvato dal professionista.",
  "Choose an area to load the current questionnaire.":
    "Scegli un'area per caricare il questionario corrente.",
  "Select an area to load the questionnaire.":
    "Seleziona un'area per caricare il questionario.",
  "Sign in to answer your questionnaire.":
    "Accedi per rispondere al questionario.",
  "No published questionnaire is available for this area.":
    "Non c'è un questionario pubblicato disponibile per questa area.",
  "Unable to load the questionnaire.": "Impossibile caricare il questionario.",
  "Answer all questions before submitting.":
    "Rispondi a tutte le domande prima di inviare.",
  "Answers could not be submitted. They may already exist.":
    "Le risposte non possono essere inviate. Potrebbero esistere già.",
  "Answers submitted.": "Risposte inviate.",
  "The questionnaire cannot be closed yet.":
    "Il questionario non può ancora essere chiuso.",
  "Questionnaire closed and profile updated.":
    "Questionario chiuso e profilo aggiornato.",
  Submitted: "Inviato",
  "Submit answers": "Invia risposte",
  "Closing...": "Chiusura...",
  "Close questionnaire": "Chiudi questionario",
  Ranking: "Ranking",

  "Performance profile": "Profilo performance",
  "Review your latest ranking, area-level real and potential values, and the snapshot history generated by closed cycles.":
    "Controlla ranking più recente, valori reali e potenziali per area e storico degli snapshot generati dai cicli chiusi.",
  "Global ranking": "Ranking globale",
  "Areas tracked": "Aree tracciate",
  Snapshots: "Snapshot",
  "Current snapshot": "Snapshot corrente",
  "Real measures current execution. Potential tracks reachable next-level capacity.":
    "Reale misura l'esecuzione attuale. Potenziale traccia la capacità raggiungibile nel prossimo livello.",
  "No profile yet": "Nessun profilo disponibile",
  "Complete and close a published questionnaire to generate the first performance snapshot.":
    "Completa e chiudi un questionario pubblicato per generare il primo snapshot performance.",
  "Snapshot timeline": "Timeline snapshot",
  "Each closed cycle appends a new historical profile point.":
    "Ogni ciclo chiuso aggiunge un nuovo punto storico al profilo.",
  "No history yet": "Nessuno storico disponibile",
  "Snapshot history appears after closing performance cycles.":
    "Lo storico snapshot appare dopo la chiusura dei cicli performance.",
  "Unknown date": "Data sconosciuta",
  "Sign in to view your performance profile.":
    "Accedi per vedere il tuo profilo performance.",
  "Unable to load performance profile.":
    "Impossibile caricare il profilo performance.",

  "Athlete summary": "Riepilogo atleti",
  "See linked athletes, pending approval load, performance profile, and jump into the right operational page without searching.":
    "Vedi atleti collegati, carico approvazioni, profilo performance e vai subito alla pagina operativa corretta.",
  "Review queue": "Coda revisioni",
  "Pending reviews": "Revisioni pendenti",
  Clear: "Libero",

  "Athlete review board": "Board revisione atleti",
  "Review every athlete with pending questionnaires and plan items in one place, then approve or reject without hunting through separate lists.":
    "Rivedi in un unico punto ogni atleta con questionari e attività pendenti, poi approva o rifiuta senza cercare in liste separate.",
  "Athletes with work": "Atleti con lavoro",
  "Plan items": "Attività",
  "Approval work by athlete": "Approvazioni per atleta",
  "Each block shows exactly what is blocking admin publication.":
    "Ogni blocco mostra esattamente cosa blocca la pubblicazione admin.",
  Profile: "Profilo",
  Area: "Area",
  "AI proposal": "Proposta AI",
  Pending: "In attesa",
  Proposed: "Proposto",
  "AI summary": "Sintesi AI",
  "Rejection reason": "Motivo del rifiuto",
  "Required only if rejecting": "Obbligatorio solo in caso di rifiuto",
  "Reject questionnaire": "Rifiuta questionario",
  "Approve questionnaire": "Approva questionario",
  "Reject plan item": "Rifiuta attività",
  "Approve plan item": "Approva attività",
  "No approval work": "Nessuna approvazione",
  "No linked athlete has questionnaires or plan items awaiting your review.":
    "Nessun atleta collegato ha questionari o attività in attesa di revisione.",
  "Sign in with a professional account.":
    "Accedi con un account professionista.",
  "This workspace is reserved for professionals.":
    "Questo ambiente è riservato ai professionisti.",
  "A rejection reason is required.": "Il motivo del rifiuto è obbligatorio.",

  "Athlete performance profile": "Profilo performance atleta",
  "Read-only performance history for a linked athlete, filtered by your assigned areas.":
    "Storico performance in sola lettura per un atleta collegato, filtrato sulle aree assegnate.",
  "Back to athletes": "Torna agli atleti",
  "Visible areas": "Aree visibili",
  "R/P values are visible only for the areas assigned to you.":
    "I valori R/P sono visibili solo per le aree assegnate.",
  "Area values": "Valori per area",
  "Current real and potential scores.": "Punteggi reali e potenziali correnti.",
  "No snapshot": "Nessuno snapshot",
  "The athlete has no published performance snapshot yet.":
    "L'atleta non ha ancora uno snapshot performance pubblicato.",
  "Snapshot history": "Storico snapshot",
  "Historical ranking and generation reason.":
    "Ranking storico e motivo di generazione.",
  "No history": "Nessuno storico",
  "Snapshots appear after each closed cycle.":
    "Gli snapshot appaiono dopo ogni ciclo chiuso.",
  "You are not allowed to view this athlete profile.":
    "Non puoi vedere il profilo di questo atleta.",

  "Operations dashboard": "Cruscotto operativo",
  "Assign one professional per athlete area, generate AI cycles when athletes are ready, track approvals, and publish without copying IDs.":
    "Assegna un professionista per area atleta, genera cicli AI quando gli atleti sono pronti, traccia le approvazioni e pubblica senza copiare ID.",
  "Ready to generate": "Pronti da generare",
  "Waiting approvals": "Approvazioni in attesa",
  "Ready to publish": "Pronti da pubblicare",
  "AI generation queue": "Coda generazione AI",
  "Athletes with completed onboarding and areas that can receive a new AI proposal.":
    "Atleti con onboarding completato e aree che possono ricevere una nuova proposta AI.",
  "Assign a professional enabled for":
    "Assegna un professionista abilitato per",
  "before generating.": "prima di generare.",
  "Preview AI": "Anteprima AI",
  "Nothing to generate": "Niente da generare",
  "No completed athlete area is available for a new proposal right now.":
    "Al momento nessuna area atleta completata è disponibile per una nuova proposta.",
  "Professional checks are complete. Admin publication activates the cycle.":
    "I controlli del professionista sono completi. La pubblicazione admin attiva il ciclo.",
  "No cycle ready": "Nessun ciclo pronto",
  "Approved cycles will appear here for one-click publication.":
    "I cicli approvati appariranno qui per la pubblicazione diretta.",
  "Approval load": "Carico approvazioni",
  "Who needs to act before admin can publish.":
    "Chi deve agire prima che l'admin possa pubblicare.",
  "No pending approval": "Nessuna approvazione pendente",
  "Professionals have no open review tasks.":
    "I professionisti non hanno revisioni aperte.",
  "Athlete ownership": "Assegnazione atleti",
  "Assign one professional per athlete and area. Reassigning an area replaces only that area owner.":
    "Assegna un professionista per atleta e area. Riassegnare un'area sostituisce solo il responsabile di quell'area.",
  Onboarding: "Onboarding",
  "Professionista abilitato": "Professionista abilitato",
  "No professional enabled for this area":
    "Nessun professionista abilitato per questa area",
  Current: "Attuale",
  owner: "responsabile",
  "Associate professional": "Associa professionista",
  "Professional competences": "Competenze professionisti",
  "Approval routing uses area competence. Keep it explicit and visible.":
    "Il routing delle approvazioni usa le competenze per area. Mantienile esplicite e visibili.",
  "AI preview": "Anteprima AI",
  "Context sent to AI": "Contesto inviato all'AI",
  "System instruction": "Istruzione di sistema",
  "Generation rules": "Regole di generazione",
  "Athlete context": "Contesto atleta",
  "Confirm and send to AI": "Conferma e invia all'AI",
  Cancel: "Annulla",
  "AI proposal generated and sent to professional approval.":
    "Proposta AI generata e inviata all'approvazione del professionista.",
  "Cycle published. Athlete now sees plan and questionnaire.":
    "Ciclo pubblicato. L'atleta ora vede piano e questionario.",
  "Competences saved. The professional sees linked athletes and matching approvals.":
    "Competenze salvate. Il professionista vede gli atleti collegati e le approvazioni coerenti.",
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const translate = (language: Language, value: string) => {
  if (language === "en") {
    return value;
  }
  const exact = dictionary[value];
  if (exact) {
    return exact;
  }
  return Object.entries(dictionary)
    .sort((a, b) => b[0].length - a[0].length)
    .reduce((next, [source, target]) => next.replaceAll(source, target), value);
};

function translateElement(root: ParentNode, language: Language) {
  if (language === "en") {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    const raw = node.nodeValue ?? "";
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const next = translate(language, trimmed);
    if (next !== trimmed) {
      node.nodeValue = raw.replace(trimmed, next);
    }
  }

  const elements = root.querySelectorAll?.(
    "[placeholder], [title], [aria-label]",
  );
  elements?.forEach((element) => {
    for (const attr of ["placeholder", "title", "aria-label"]) {
      const current = element.getAttribute(attr);
      if (current) {
        element.setAttribute(attr, translate(language, current));
      }
    }
  });
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("it");

  useEffect(() => {
    const stored = window.localStorage.getItem("pf.language");
    if (stored === "it" || stored === "en") {
      setLanguageState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    translateElement(document.body, language);
    const observer = new MutationObserver(() =>
      translateElement(document.body, language),
    );
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: (next) => {
        window.localStorage.setItem("pf.language", next);
        window.location.reload();
      },
      t: (text) => translate(language, text),
    }),
    [language],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="pf-lang-toggle" aria-label="Language selector">
      <button
        type="button"
        className={language === "it" ? "active" : ""}
        onClick={() => setLanguage("it")}
      >
        IT
      </button>
      <button
        type="button"
        className={language === "en" ? "active" : ""}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
    </div>
  );
}
