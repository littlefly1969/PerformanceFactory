import {
  OnboardingInputType,
  OnboardingQuestionScope,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const defaultInitialContext =
  'Sei un assistente senior di sport performance a supporto di professionisti umani. Genera una proposta di miglioramento specifica per area e tre domande di monitoraggio usando solo il contesto atleta fornito. Rispondi esclusivamente in italiano e solo con JSON valido conforme allo schema. Il lavoro deve essere pratico, misurabile, progressivo e revisionabile da un professionista. Non inventare diagnosi, indicazioni mediche, dati atleta non presenti o contesto nascosto. Se esistono lavori precedenti, usa note di completamento, punteggi e motivi di rifiuto per migliorare la proposta.';

const defaultResponseFormatPrompt =
  'La risposta deve contenere una sintesi breve, da uno a tre esercizi/attivita con titolo e descrizione operativa, e tre domande di monitoraggio. Ogni attivita deve indicare azione, frequenza o trigger, criterio misurabile di successo e progressione. Le domande devono essere brevi, osservabili e collegate al lavoro proposto.';

const defaultQuestionnaireLayoutJson = {
  questionnaire: {
    questions: 3,
    answerOptions: [
      { label: 'Non ancora', score: 0 },
      { label: 'A volte', score: 50 },
      { label: 'Spesso', score: 75 },
      { label: 'Con costanza', score: 100 },
    ],
    questionStyle: 'breve, concreta, misurabile',
    focus: 'aderenza o esecuzione osservabile del lavoro proposto',
  },
} satisfies Prisma.InputJsonValue;

async function main() {
  console.log('[seed] start');
  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const generalProfessional = await prisma.user.upsert({
    where: { email: 'pro@example.com' },
    update: {},
    create: {
      email: 'pro@example.com',
      password: passwordHash,
      role: UserRole.PROFESSIONAL,
    },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      password: passwordHash,
      role: UserRole.USER,
    },
  });

  const areas = [
    'Technical-Tactical',
    'Athletic Preparation',
    'Equipment',
    'Physiotherapy',
    'Nutrition',
    'Mental Training',
  ];

  for (const name of areas) {
    await prisma.area.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const professionalEmailsByArea: Record<string, string> = {
    'Athletic Preparation': 'prof_AP@example.it',
    Equipment: 'prof_EQ@example.it',
    'Mental Training': 'prof_MT@example.it',
    Nutrition: 'prof_NU@example.it',
    Physiotherapy: 'prof_PT@example.it',
    'Technical-Tactical': 'prof_TT@example.it',
  };

  for (const email of Object.values(professionalEmailsByArea)) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password: passwordHash,
        role: UserRole.PROFESSIONAL,
      },
    });
  }

  const areaRecords = await prisma.area.findMany({
    where: { name: { in: Object.keys(professionalEmailsByArea) } },
    select: { id: true, name: true },
  });

  for (const area of areaRecords) {
    await prisma.professionalAreaCompetence.upsert({
      where: {
        professionalId_areaId: {
          professionalId: generalProfessional.id,
          areaId: area.id,
        },
      },
      update: {},
      create: {
        professionalId: generalProfessional.id,
        areaId: area.id,
      },
    });
  }

  for (const area of areaRecords) {
    await prisma.professionalUserLink.upsert({
      where: {
        userId_areaId: {
          userId: demoUser.id,
          areaId: area.id,
        },
      },
      update: { professionalId: generalProfessional.id },
      create: {
        professionalId: generalProfessional.id,
        userId: demoUser.id,
        areaId: area.id,
      },
    });
  }

  for (const area of areaRecords) {
    const email = professionalEmailsByArea[area.name];
    const professional = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!professional) {
      continue;
    }
    await prisma.professionalAreaCompetence.upsert({
      where: {
        professionalId_areaId: {
          professionalId: professional.id,
          areaId: area.id,
        },
      },
      update: {},
      create: {
        professionalId: professional.id,
        areaId: area.id,
      },
    });

    await prisma.professionalUserLink.upsert({
      where: {
        userId_areaId: {
          userId: demoUser.id,
          areaId: area.id,
        },
      },
      update: { professionalId: professional.id },
      create: {
        professionalId: professional.id,
        userId: demoUser.id,
        areaId: area.id,
      },
    });
  }

  const generalQuestions: Array<{
    key: string;
    label: string;
    helpText?: string;
    inputType: OnboardingInputType;
    optionsJson?: Prisma.InputJsonValue;
    orderIndex: number;
  }> = [
    {
      key: 'general_height_cm',
      label: 'Altezza in centimetri',
      inputType: OnboardingInputType.NUMBER,
      orderIndex: 1,
    },
    {
      key: 'general_weight_kg',
      label: 'Peso in chilogrammi',
      inputType: OnboardingInputType.NUMBER,
      orderIndex: 2,
    },
    {
      key: 'general_age',
      label: 'Eta',
      inputType: OnboardingInputType.NUMBER,
      orderIndex: 3,
    },
    {
      key: 'general_health_status',
      label: 'Stato di salute generale, eventuali limitazioni o infortuni noti',
      inputType: OnboardingInputType.TEXT,
      orderIndex: 4,
    },
    {
      key: 'general_sedentary_level',
      label: 'Livello di sedentarieta',
      inputType: OnboardingInputType.SELECT,
      optionsJson: [
        { label: 'Basso', value: 'LOW' },
        { label: 'Medio', value: 'MEDIUM' },
        { label: 'Alto', value: 'HIGH' },
      ],
      orderIndex: 5,
    },
    {
      key: 'general_training_frequency',
      label: 'Frequenza media di allenamento settimanale',
      inputType: OnboardingInputType.SELECT,
      optionsJson: [
        { label: '0-1 sessioni', value: '0_1' },
        { label: '2-3 sessioni', value: '2_3' },
        { label: '4-5 sessioni', value: '4_5' },
        { label: '6+ sessioni', value: '6_PLUS' },
      ],
      orderIndex: 6,
    },
  ];

  for (const question of generalQuestions) {
    await prisma.onboardingQuestionTemplate.upsert({
      where: { key: question.key },
      update: {
        label: question.label,
        helpText: question.helpText,
        inputType: question.inputType,
        optionsJson: question.optionsJson ?? Prisma.JsonNull,
        orderIndex: question.orderIndex,
        scope: OnboardingQuestionScope.GENERAL,
        areaId: null,
        isActive: true,
      },
      create: {
        ...question,
        scope: OnboardingQuestionScope.GENERAL,
        optionsJson: question.optionsJson ?? Prisma.JsonNull,
        isActive: true,
        createdById: admin.id,
      },
    });
  }

  const areaQuestionText: Record<string, string[]> = {
    'Technical-Tactical': [
      'Quanto e costante la tua esecuzione tecnico-tattica sotto pressione di gara?',
      'Quanto riesci a scegliere la soluzione corretta quando ritmo e avversario cambiano?',
    ],
    'Athletic Preparation': [
      'Quanto ti senti pronto fisicamente su resistenza, forza e recupero?',
      'Quanto mantieni qualita tecnica nelle fasi finali di allenamento o gara?',
    ],
    Equipment: [
      'Quanto il tuo setup di attrezzatura supporta gli obiettivi di performance attuali?',
      'Quanto sei sicuro che materiali, calzature e regolazioni siano adeguati al carico attuale?',
    ],
    Physiotherapy: [
      'Quanto e stabile la tua condizione fisica rispetto a dolore, prevenzione e mobilita?',
      'Quanto rispetti routine di prevenzione, recupero e segnalazione dei fastidi?',
    ],
    Nutrition: [
      'Quanto alimentazione e idratazione sono allineate alle richieste di allenamento e gara?',
      'Quanto pianifichi pasti, snack e liquidi intorno agli impegni sportivi?',
    ],
    'Mental Training': [
      'Quanto sono solidi focus, controllo emotivo e fiducia durante la performance?',
      'Quanto sai recuperare concentrazione dopo un errore o un momento difficile?',
    ],
  };

  const scoreOptions = [
    { value: 20, label: 'Critico' },
    { value: 40, label: 'Fragile' },
    { value: 60, label: 'Stabile' },
    { value: 80, label: 'Forte' },
    { value: 100, label: 'Elite' },
  ];

  for (const area of areaRecords) {
    const questions = areaQuestionText[area.name] ?? [];
    for (const [index, label] of questions.entries()) {
      await prisma.onboardingQuestionTemplate.upsert({
        where: { key: `area_${area.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${index + 1}` },
        update: {
          scope: OnboardingQuestionScope.AREA,
          areaId: area.id,
          label,
          inputType: OnboardingInputType.SCORE,
          optionsJson: scoreOptions,
          orderIndex: 100 + index,
          isActive: true,
        },
        create: {
          key: `area_${area.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${index + 1}`,
          scope: OnboardingQuestionScope.AREA,
          areaId: area.id,
          label,
          inputType: OnboardingInputType.SCORE,
          optionsJson: scoreOptions,
          orderIndex: 100 + index,
          isActive: true,
          createdById: admin.id,
        },
      });
    }
  }

  await prisma.aiPromptConfig.upsert({
    where: { id: 'default-global-baseline-prompt' },
    update: {
      name: 'Prompt generale baseline',
      athleteLevel: 'BASELINE',
      areaId: null,
      isActive: true,
      basePrompt:
        'Usa le informazioni anamnestiche generali, il livello di sedentarieta, lo stato di salute dichiarato e la baseline per creare lavori prudenti, progressivi e verificabili. Mantieni tono professionale, evita diagnosi e segnala quando serve revisione umana specialistica.',
      updatedById: admin.id,
    },
    create: {
      id: 'default-global-baseline-prompt',
      name: 'Prompt generale baseline',
      athleteLevel: 'BASELINE',
      areaId: null,
      isActive: true,
      basePrompt:
        'Usa le informazioni anamnestiche generali, il livello di sedentarieta, lo stato di salute dichiarato e la baseline per creare lavori prudenti, progressivi e verificabili. Mantieni tono professionale, evita diagnosi e segnala quando serve revisione umana specialistica.',
      createdById: admin.id,
    },
  });

  for (const area of areaRecords) {
    await prisma.aiAreaGenerationConfig.upsert({
      where: { areaId: area.id },
      update: {},
      create: {
        id: `area-generation-config-${area.id}`,
        areaId: area.id,
        initialContext: defaultInitialContext,
        responseFormatPrompt: defaultResponseFormatPrompt,
        questionnaireLayoutJson: defaultQuestionnaireLayoutJson,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });

    await prisma.aiPromptConfig.upsert({
      where: { id: `default-${area.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-baseline-prompt` },
      update: {
        name: `${area.name} baseline`,
        areaId: area.id,
        athleteLevel: 'BASELINE',
        isActive: true,
        basePrompt: `Per l area ${area.name}, genera indicazioni iniziali semplici, misurabili e compatibili con il livello baseline dell atleta. Collega sempre piano e domande alle risposte anamnestiche dell area e alla sicurezza operativa.`,
        updatedById: admin.id,
      },
      create: {
        id: `default-${area.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-baseline-prompt`,
        name: `${area.name} baseline`,
        areaId: area.id,
        athleteLevel: 'BASELINE',
        isActive: true,
        basePrompt: `Per l area ${area.name}, genera indicazioni iniziali semplici, misurabili e compatibili con il livello baseline dell atleta. Collega sempre piano e domande alle risposte anamnestiche dell area e alla sicurezza operativa.`,
        createdById: admin.id,
      },
    });
  }

  const activeScale = await prisma.performanceScaleConfig.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  if (!activeScale) {
    await prisma.performanceScaleConfig.create({
      data: {
        minScore: 0,
        maxScore: 100,
        potentialStep: 5,
        thresholdRatio: 0.85,
        isActive: true,
      },
    });
  }

  const [
    userCount,
    areaCount,
    competenceCount,
    linkCount,
    scaleCount,
    onboardingTemplateCount,
    promptConfigCount,
  ] =
    await Promise.all([
      prisma.user.count(),
      prisma.area.count(),
      prisma.professionalAreaCompetence.count(),
      prisma.professionalUserLink.count(),
      prisma.performanceScaleConfig.count(),
      prisma.onboardingQuestionTemplate.count(),
      prisma.aiPromptConfig.count(),
    ]);

  console.log(
    `[seed] done users=${userCount} areas=${areaCount} competences=${competenceCount} links=${linkCount} scales=${scaleCount} onboardingTemplates=${onboardingTemplateCount} promptConfigs=${promptConfigCount} admin=${admin.email}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
