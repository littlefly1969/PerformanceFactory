import {
  AiCycleContext,
  CycleHistorySummaryInput,
  CycleProposalInput,
  GoalValidationInput,
  QUESTIONS_PER_AREA,
  SpecialistOnboardingQuestionInput,
  SYSTEM_PROMPT,
} from './proposal-provider-model';
import { cycleQuestionLayout } from './proposal-schemas';

export function buildProposalPrompt(input: CycleProposalInput) {
  const areaGenerationConfig = input.context.guidance.areaGenerationConfig;
  const questionLayout = cycleQuestionLayout(input);
  return {
    task: `Genera una proposta di lavoro specifica per area e ${questionLayout.questions} domande di valutazione basate sul contesto atleta fornito.`,
    constraints: {
      questions: questionLayout.questions,
      answerOptions: questionLayout.answerOptions,
      responseFormat:
        areaGenerationConfig?.responseFormatPrompt ??
        'Usa il formato JSON richiesto dallo schema tecnico.',
      questionnaireLayout: questionLayout.raw,
      questionnaireLayoutSource:
        'Contesto e layout AI della configurazione area; numero domande e opzioni risposta sono vincolanti.',
      scoreRange: {
        min: input.scale.minScore,
        max: input.scale.maxScore,
      },
      areaIndependentCycle: true,
      humanReviewRequired: true,
      language: 'Italiano',
      planItems: {
        minItems: 1,
        maxItems: 3,
        mustInclude:
          'azione chiara, frequenza o trigger, criterio di successo misurabile e indicazione di progressione',
      },
      questionsMustMeasure:
        'esecuzione osservabile o aderenza al lavoro generato per l area target',
    },
    context: buildModelContext(input.context),
  };
}

export function buildHistorySummaryPrompt(input: CycleHistorySummaryInput) {
  return {
    task: 'Produci un sunto tecnico dei cicli storici piu vecchi, da aggiungere ai prompt futuri senza sostituire gli ultimi tre cicli completi.',
    scope: input.scope,
    targetLabel: input.targetLabel,
    coveredCycles: input.coveredCycles,
    rules: [
      'Usa solo i dati presenti nei cicli forniti.',
      'Non inventare diagnosi, metriche, ritmi, frequenze o vincoli mancanti.',
      'Conserva solo informazioni utili a generare il prossimo lavoro: cosa e stato assegnato, completato, rifiutato, feedback, punteggi, segnali di rischio e progressione.',
      'Distingui fatti osservati da inferenze prudenti.',
      'Il testo deve essere sintetico ma operativo per il prossimo prompt AI.',
    ],
    outputShape:
      'Restituisci summaryText e liste stableSignals, completedWork, unresolvedRisks, progressionNotes.',
  };
}

export function buildSpecialistOnboardingQuestionTask(
  input: SpecialistOnboardingQuestionInput,
) {
  return {
    task: 'Genera esattamente tre domande anamnestiche specialistiche per ciascuna area ufficiale. Le domande saranno mostrate all atleta dopo l anamnesi generale.',
    language: 'Italiano',
    athleteGoal: input.goalText,
    interpretedGoal: input.interpretedGoal,
    normalizedGoal: input.normalizedGoal ?? null,
    sportSelection: input.sportSelection ?? null,
    sportSpecializationPromptInstructions:
      input.sportSpecializationPromptInstructions?.map((instruction) => ({
        sport: instruction.sportLabel,
        areaName: instruction.areaName,
        version: instruction.version,
        basePrompt: instruction.basePrompt,
      })) ?? [],
    generalProfile: input.generalProfile,
    generalAnswers: input.generalAnswers,
    areas: input.areas,
    constraints: {
      questionsPerArea: QUESTIONS_PER_AREA,
      questionType:
        'Domande SCORE a risposta su scala numerica 1-5. Il testo puo indicare chiaramente che la risposta va data da 1 a 5.',
      answerScale:
        'Scala 1-5: 1 = molto basso o molto critico, 2 = fragile, 3 = sufficiente/stabile, 4 = buono/forte, 5 = eccellente.',
      numericQuestionWording:
        'Ogni domanda deve essere valutabile con un numero da 1 a 5. Usa formule come "Quanto...", "In che misura...", "Quanto ritieni..." o "Quanto e presente...". Non usare domande aperte come "Quali sono...", "Descrivi...", "Elenca..." o "Spiega...", perche l atleta non avra un campo testuale.',
      personalization:
        'Ogni domanda deve essere coerente con obiettivo, dati generali e atleta specifico; non usare domande generiche uguali per tutti.',
      realismCheck:
        'Le risposte devono dare all AI dati sufficienti per capire alla validazione finale se l obiettivo e realistico rispetto a sport scelto, anamnesi generale, baseline per area e vincoli dichiarati.',
      areaSpecificity:
        'Ogni domanda deve citare o riflettere chiaramente il lavoro della propria area, evitando duplicazioni tra aree.',
      avoid: [
        'diagnosi mediche',
        'prescrizioni cliniche',
        'richieste di dati non necessari',
        'promesse di risultato',
        'domande gia presenti nell anamnesi generale',
      ],
    },
    outputShape:
      'Restituisci areaQuestions: array con areaId e questions. Ogni questions contiene tre oggetti con text e orderIndex 1..3.',
  };
}

export function buildGoalValidationTask(input: GoalValidationInput) {
  const finalValidation = Boolean(
    input.onboardingProfile || input.onboardingAnswers,
  );
  return {
    task: 'Valida l obiettivo iniziale Performance Factory e, solo se status=OK, genera prompt specialistici per le aree abilitate.',
    evaluationPhase: finalValidation
      ? 'VALIDAZIONE_FINALE_DOPO_ANAMNESI'
      : 'BOZZA_OBIETTIVO_PRIMA_DELL_ANAMNESI',
    platformPrinciple:
      'Performance Factory promuove il miglioramento personale rispetto al punto di partenza, non il confronto tossico con gli altri.',
    officialAreas: input.areas.map((area) => area.name),
    athleteGoal: input.goalText,
    sportSelection: input.sportSelection ?? null,
    sportSpecializationPromptInstructions:
      input.sportSpecializationPromptInstructions?.map((instruction) => ({
        sport: instruction.sportLabel,
        areaName: instruction.areaName,
        version: instruction.version,
        basePrompt: instruction.basePrompt,
      })) ?? [],
    refinementContext: input.refinementContext ?? null,
    datiAnamnestici: input.onboardingProfile ?? null,
    storicoRisposte: input.onboardingAnswers ?? null,
    availableAreas: input.areas,
    statuses: [
      'OK',
      'NEEDS_ANAMNESIS',
      'GOAL_NEEDS_REFORMULATION',
      'OUT_OF_SCOPE',
      'UNSAFE',
    ],
    decisionRules: {
      OK: finalValidation
        ? 'Obiettivo sportivo/performance, chiaro, sicuro, personale, misurabile e realistico rispetto a sport scelto, anamnesi generale, risposte specialistiche e baseline dichiarata.'
        : 'Obiettivo sportivo/performance, chiaro, sicuro, personale e misurabile nei suoi elementi essenziali. Non servono ancora frequenza di allenamento, dieta, abitudini o anamnesi: quei dati arrivano dopo nei questionari.',
      NEEDS_ANAMNESIS:
        'Usalo solo se l obiettivo cita dolore, trauma, patologie, sintomi o rischio concreto che richiede dati personali prima di procedere.',
      GOAL_NEEDS_REFORMULATION:
        'Obiettivo potenzialmente coerente ma troppo vago, generico, non misurabile, senza sport/attivita, senza risultato desiderato o troppo orientato a battere altri.',
      OUT_OF_SCOPE:
        'Obiettivo non collegato a sport, performance, benessere funzionale o miglioramento personale.',
      UNSAFE:
        'Obiettivo rischioso, illecito, clinicamente improprio, doping, restrizioni estreme o ignora dolore/trauma/sintomi.',
    },
    healthLimits: [
      'Nutrizione: solo educazione sportiva generale, idratazione, timing, recupero, energia disponibile; niente diete cliniche, grammature obbligatorie, farmaci o gestione DCA.',
      'Fisioterapia: prevenzione, mobilita, recupero e monitoraggio prudente; niente diagnosi o protocolli terapeutici.',
      'Per dolore acuto, trauma, sintomi neurologici, dolore toracico, svenimenti, disturbi alimentari, patologie note o farmaci, suggerire valutazione professionale.',
    ],
    outputRules: [
      'Rispondi solo in JSON valido.',
      'Il campo status governa il flusso.',
      'Se refinementContext e presente, conserva le parti gia utili dell obiettivo originale e della bozza corrente, integra solo le nuove risposte dell utente e non chiedere di riscrivere tutto.',
      finalValidation
        ? 'La fase corrente serve a validare definitivamente obiettivo e realismo, non a generare ancora l allenamento.'
        : 'La fase corrente serve SOLO a definire l obiettivo, non a fare anamnesi, onboarding, allenamento o questionario sulle abitudini.',
      finalValidation
        ? 'Questa e la validazione finale: usa datiAnamnestici e storicoRisposte per decidere se l obiettivo e realistico. Se non lo e, usa GOAL_NEEDS_REFORMULATION e spiega cosa va ridimensionato o chiarito.'
        : 'Questa non e la validazione finale: se mancano dati personali ma l obiettivo e sensato, usa NEEDS_ANAMNESIS.',
      'Se mancano informazioni, fai al massimo 3 domande specifiche e brevi in questions_to_user, riferite solo a: sport/attivita, risultato concreto desiderato, criterio di misura, orizzonte temporale, punto di partenza espresso come prestazione attuale.',
      'La scelta sportiva dell atleta e vincolante: non chiedere quale sport pratica se sportSelection e presente; usa quella selezione per valutare pertinenza e generare prompt area.',
      'Integra i prompt sportSpecializationPromptInstructions nei prompt area finali: ogni area deve riflettere sport, specializzazione e istruzioni amministrative specifiche.',
      'Non chiedere quante volte si allena, quanto spesso si allena, quanto mangia, cosa mangia, dieta, sonno, stress, disponibilita settimanale, attrezzatura, infortuni o dettagli sul metodo per raggiungere l obiettivo. Questi dati appartengono ai questionari successivi.',
      'Se l obiettivo e gia comprensibile ma mancano dettagli sul metodo o sulle abitudini, considera status=OK e lascia che i questionari raccolgano quei dati.',
      'Se status diverso da OK, area_prompts deve avere tutti i valori null.',
      'Se status OK, compila tutti i prompt delle aree abilitate in availableAreas.',
      'Ogni prompt area deve essere utilizzabile da un modulo AI specialistico e contenere role, objective, required_inputs, initial_questionnaire, exercise_generation_rules, feedback_questions, progression_rules, measurement_indicators, safety_limits, output_format.',
    ],
  };
}

export function buildModelContext(context: AiCycleContext) {
  const { guidance: _guidance, ...modelContext } = context;
  void _guidance;
  return modelContext;
}

export function buildSystemPrompt(input: CycleProposalInput) {
  const basePrompt =
    input.context.guidance.areaGenerationConfig?.initialContext ??
    SYSTEM_PROMPT;
  const responseFormatPrompt =
    input.context.guidance.areaGenerationConfig?.responseFormatPrompt;
  const sections = [basePrompt];
  if (responseFormatPrompt) {
    sections.push(`Forma della risposta configurata:\n${responseFormatPrompt}`);
  }
  if (input.context.guidance.userAreaPromptInstruction) {
    sections.push(
      [
        'Prompt area personalizzato dell atleta:',
        stripEmbeddedSportPromptInstructions(
          input.context.guidance.userAreaPromptInstruction.basePrompt,
        ),
      ].join('\n'),
    );
  }
  if (input.context.guidance.sportSpecializationPromptInstruction) {
    const sportPrompt =
      input.context.guidance.sportSpecializationPromptInstruction;
    sections.push(
      [
        'Prompt sport-specializzazione corrente configurato dall amministratore. Questo prompt prevale su eventuali istruzioni sport vecchie presenti nello storico atleta.',
        `[${sportPrompt.sportLabel} - ${sportPrompt.specializationLabel} / ${sportPrompt.areaName} v${sportPrompt.version}]`,
        sportPrompt.basePrompt,
      ].join('\n'),
    );
  }
  if (input.context.guidance.trainingPromptInstruction) {
    const trainingPrompt = input.context.guidance.trainingPromptInstruction;
    sections.push(
      [
        'Prompt allenamento specifico corrente configurato dall amministratore.',
        `[Allenamento ${trainingPrompt.sportLabel} - ${trainingPrompt.specializationLabel} v${trainingPrompt.version}]`,
        trainingPrompt.basePrompt,
      ].join('\n'),
    );
  }
  return sections.join('\n\n');
}

export function stripEmbeddedSportPromptInstructions(promptText: string) {
  return promptText
    .replace(/\n*\[Prompt sport [^\]]+\]\n[\s\S]*?(?=\n\n\{|$)/g, '')
    .trim();
}
