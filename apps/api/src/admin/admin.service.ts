import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OnboardingInputType,
  OnboardingQuestionScope,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertAiAreaGenerationConfigDto } from './dto/upsert-ai-area-generation-config.dto';
import { UpsertOnboardingTemplateDto } from './dto/upsert-onboarding-template.dto';
import { UpsertGoalPromptConfigDto } from './dto/upsert-goal-prompt-config.dto';
import { OrchestratorService } from '../ai-orchestrator/orchestrator.service';

const DEFAULT_INITIAL_CONTEXT =
  'Sei un assistente senior di sport performance a supporto di professionisti umani. Genera una proposta di miglioramento specifica per area e le domande di monitoraggio richieste dal layout AI usando solo il contesto atleta fornito. Rispondi esclusivamente in italiano e solo con JSON valido conforme allo schema. Il lavoro deve essere pratico, misurabile, progressivo e revisionabile da un professionista. Non inventare diagnosi, indicazioni mediche, dati atleta non presenti o contesto nascosto. Se esistono lavori precedenti, usa note di completamento, punteggi e motivi di rifiuto per migliorare la proposta.';

const DEFAULT_RESPONSE_FORMAT_PROMPT =
  'La risposta deve contenere una sintesi breve, da uno a tre esercizi/attivita con titolo e descrizione operativa, e il numero di domande di monitoraggio richiesto dal layout AI. Ogni attivita deve indicare azione, frequenza o trigger, criterio misurabile di successo e progressione. Le domande devono essere brevi, osservabili e collegate al lavoro proposto.';

const DEFAULT_QUESTIONNAIRE_LAYOUT_JSON = {
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
};

const DEFAULT_GOAL_PROMPT = [
  'Sei l AI guida di Performance Factory, una piattaforma orientata al miglioramento della performance sportiva personale.',
  'Performance Factory non promuove il confronto tossico con gli altri, ma il miglioramento progressivo dell utente rispetto al proprio punto di partenza.',
  'Analizza l obiettivo iniziale dichiarato dall utente, valutane qualita, sicurezza, pertinenza, liceita e chiarezza, poi decidi se il sistema puo procedere alla costruzione di un percorso personalizzato.',
  'Le aree ufficiali disponibili sono quelle configurate nel sistema e abilitate per la sport-specializzazione selezionata.',
  'Classifica sempre con uno solo di questi status: OK, NEEDS_ANAMNESIS, GOAL_NEEDS_REFORMULATION, OUT_OF_SCOPE, UNSAFE.',
  'Usa OK solo se l obiettivo e sportivo o legato alla performance, chiaro, sicuro, orientato al miglioramento personale e i dati disponibili bastano per generare i prompt delle aree abilitate.',
  'Usa NEEDS_ANAMNESIS se l obiettivo e valido ma mancano dati personali indispensabili per costruire il percorso.',
  'Usa GOAL_NEEDS_REFORMULATION se l obiettivo e potenzialmente coerente ma troppo generico, vago, non misurabile o troppo orientato al confronto con altri.',
  'Usa OUT_OF_SCOPE se l obiettivo non riguarda sport, performance, benessere funzionale o miglioramento personale.',
  'Usa UNSAFE se l obiettivo implica rischi fisici, sanitari, psicologici o legali, doping, farmaci usati impropriamente, restrizioni alimentari estreme, violenza, frode, danno a se o ad altri, oppure se l utente vuole ignorare dolore, trauma o sintomi.',
  'Per Nutrizione e Fisioterapia non fare diagnosi, non prescrivere farmaci, diete cliniche o protocolli terapeutici e non sostituirti a professionisti sanitari. In presenza di segnali di allarme suggerisci valutazione professionale prima di procedere.',
  'Rispondi sempre e solo in JSON valido, senza markdown e senza testo fuori dal JSON.',
  'Il JSON deve contenere: status, goal_evaluation, message_to_user, suggested_reformulated_goal, questions_to_user, normalized_goal, area_prompts, next_step.',
  'Se status e diverso da OK, area_prompts deve contenere valori null per tutte le aree richieste nel contesto.',
  'Se status e OK, compila tutti i prompt delle aree richieste nel contesto. Ogni prompt area deve contenere role, objective, required_inputs, initial_questionnaire, exercise_generation_rules, feedback_questions, progression_rules, measurement_indicators, safety_limits, output_format.',
].join('\n');

const RUNNING_ROAD_TRAINING_PROMPT = [
  '[Prompt Allenamento Corsa - Strada v1]',
  '',
  'Adatta la generazione dell allenamento allo scenario sportivo Corsa - Strada.',
  '',
  'Questo prompt non appartiene all area Preparazione atletica complementare. Deve generare allenamenti veri e propri di corsa su strada: sedute operative, microcicli o progressioni finalizzate al miglioramento della performance nella corsa, in base all obiettivo configurato e al contesto atleta disponibile.',
  '',
  'Usa la scelta Corsa - Strada come vincolo prioritario per interpretare obiettivo, anamnesi, risposte dell atleta, note, punteggi, lavori assegnati, completamenti, rifiuti, feedback, istruzioni configurate dall amministratore, limiti di sicurezza, indicatori di monitoraggio e regole di progressione.',
  '',
  'Usa obbligatoriamente tutto e solo il contesto fornito nei blocchi successivi. Non chiedere nuove informazioni preliminari. Non inventare dati mancanti.',
  '',
  'La proposta deve essere un allenamento reale di corsa su strada, non una lista generica di esercizi fisici. Deve indicare cosa deve fare l atleta durante la seduta o nel periodo richiesto, con struttura chiara, intensita, volume, recuperi, criteri di successo e progressione.',
  '',
  'Quando l obiettivo riguarda 5 km, 10 km, mezza maratona, maratona o endurance running, costruisci l allenamento in modo coerente con la distanza, il livello di informazioni disponibili, la tolleranza al carico, l anamnesi e la frequenza di allenamento eventualmente indicata.',
  '',
  'Gli allenamenti possono includere, quando pertinenti: fondo lento; corsa facile; corsa rigenerante; lungo lento; medio; progressivo; fartlek; ripetute brevi; ripetute medie; ripetute lunghe; lavori a ritmo gara; salite solo se coerenti con il contesto; sedute di recupero; settimane di scarico; progressione del volume; progressione dell intensita; combinazioni prudenti di corsa e recupero attivo.',
  '',
  'Non trasformare l allenamento in preparazione atletica complementare. Core stability, forza, mobilita e prevenzione possono essere citati solo come eventuale supporto secondario se previsto dal contesto, ma il contenuto principale deve essere la seduta di corsa.',
  '',
  'Non inventare passo gara, ritmo al km, frequenza cardiaca, zone, soglie, FTP, VO2max, chilometraggio settimanale, disponibilita settimanale, livello atletico, storico infortuni, test o attrezzatura se non sono presenti nel contesto.',
  '',
  'Se sono disponibili ritmi, zone cardiache, test recenti, passo gara, RPE, chilometraggio o frequenza settimanale, usali per rendere l allenamento piu preciso.',
  '',
  'Se ritmi, zone o test non sono disponibili, usa parametri prudenti e osservabili come durata, distanza controllata, RPE, capacita di parlare durante la corsa, recupero percepito, assenza di dolore, qualita del movimento, regolarita del passo e recupero entro il giorno successivo.',
  '',
  'La progressione deve rispettare la logica della corsa su strada: prima consolidare regolarita e tolleranza al carico; poi aumentare gradualmente il volume; poi inserire intensita controllata; poi aumentare specificita verso la distanza obiettivo; evitare aumenti simultanei di volume, intensita e complessita.',
  '',
  'Se il contesto indica mezza maratona o maratona, privilegia continuita aerobica, lunghi progressivi, gestione del ritmo, capacita di sostenere il carico, recupero tra sedute e progressione sostenibile. Non proporre lavori massimali o eccessivamente intensi se il contesto non li giustifica.',
  '',
  'Se il contesto indica fastidi, infortuni precedenti, dolore, problemi alla schiena, sovraccarichi, affaticamento elevato o recupero insufficiente, riduci volume, intensita e complessita. In questi casi privilegia corsa facile, durata controllata, recuperi ampi, monitoraggio della risposta e progressione conservativa.',
  '',
  'Ogni allenamento deve essere strutturato in modo operativo e deve includere: obiettivo della seduta; riscaldamento; parte centrale; defaticamento; intensita; volume totale o durata totale; recuperi se presenti; criterio misurabile di successo; progressione consigliata; segnali per ridurre o interrompere il lavoro.',
  '',
  'L intensita deve essere indicata con il parametro piu affidabile disponibile nel contesto: ritmo al km se fornito; frequenza cardiaca o zone se fornite; RPE se non sono disponibili dati piu precisi; descrizione percettiva prudente se non sono presenti metriche oggettive.',
  '',
  'I criteri di successo devono essere concreti e misurabili, ad esempio completare la seduta senza dolore, mantenere RPE entro il range indicato, mantenere ritmo regolare, chiudere la seduta senza calo marcato, recuperare entro 24 ore, non peggiorare fastidi riferiti, completare il volume previsto senza aumentare la fatica oltre il limite indicato, mantenere buona qualita di corsa nella parte finale.',
  '',
  'Le progressioni devono essere semplici, verificabili e coerenti con il contesto, ad esempio aumentare la durata di pochi minuti, aumentare la distanza solo se il recupero e buono, aggiungere una ripetizione solo se la seduta precedente e stata completata senza segnali negativi, mantenere invariata l intensita aumentando prima la continuita, inserire ritmo gara solo dopo consolidamento del fondo, ridurre il carico se compaiono dolore, affaticamento anomalo o recupero insufficiente.',
  '',
  'Non generare piani aggressivi. Non proporre incrementi arbitrari. Se il contesto amministratore indica limiti specifici, come incremento massimo settimanale, priorita al volume prima dell intensita o adattamento basato su assenza di dolore, tali limiti prevalgono sempre.',
  '',
  'Se devi generare una singola seduta, produci una seduta completa e immediatamente eseguibile.',
  '',
  'Se devi generare un microciclo settimanale, distribuisci le sedute in modo coerente con frequenza disponibile, recupero, obiettivo e anamnesi. Non inventare giorni o frequenza se non sono forniti: in quel caso genera solo la prossima seduta o una proposta modulare adattabile.',
  '',
  'Se devi generare una progressione verso mezza maratona o maratona, organizza il lavoro in blocchi progressivi, rispettando carico, recupero, settimane di scarico e specificita crescente verso la distanza obiettivo.',
  '',
  'Le domande di monitoraggio, se richieste dallo schema, non devono raccogliere dati preliminari generici. Devono servire a valutare la risposta alla seduta proposta, ad esempio dolore o fastidio durante/dopo la corsa, livello di fatica percepita, qualita del recupero, risposta della schiena se pertinente, risposta di polpacci, tendini, ginocchia, anche o piedi, capacita di completare il lavoro mantenendo il ritmo o l RPE previsto, impatto sulla seduta successiva.',
  '',
  'Rispondi solo in italiano e solo con JSON valido conforme allo schema richiesto.',
  '',
  'La risposta deve contenere una proposta di allenamento reale per Corsa - Strada, coerente con obiettivo, anamnesi, istruzioni configurate e dati disponibili.',
  '',
  'Non inserire diagnosi, consigli medici, trattamenti riabilitativi specialistici o dati non presenti nel contesto. In presenza di segnali critici gia indicati, mantieni la proposta conservativa e rimanda alla valutazione di un professionista qualificato.',
  '',
  'Schema JSON consigliato per questo modulo:',
  '{"stato_conoscenza_profilo_atleta":"","sintesi":"","tipo_output":"singola_seduta | microciclo | progressione","obiettivo_allenamento":"","allenamento":{"titolo":"","tipo_seduta":"","durata_totale":"","volume_totale":"","riscaldamento":{"descrizione":"","durata":"","intensita":""},"parte_centrale":{"descrizione":"","serie_o_blocchi":"","recuperi":"","intensita":""},"defaticamento":{"descrizione":"","durata":"","intensita":""},"criterio_successo":"","progressione":"","segnali_riduzione_o_stop":""},"monitoraggio":["","",""]}',
].join('\n');

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  private goalPromptVersionContent(config: {
    name: string;
    basePrompt: string;
    isActive: boolean;
  }): Prisma.InputJsonObject {
    return {
      name: config.name,
      basePrompt: config.basePrompt,
      isActive: config.isActive,
    };
  }

  private areaGenerationVersionContent(config: {
    areaId: string;
    initialContext: string;
    responseFormatPrompt: string;
    questionnaireLayoutJson: unknown;
  }): Prisma.InputJsonObject {
    return {
      areaId: config.areaId,
      initialContext: config.initialContext,
      responseFormatPrompt: config.responseFormatPrompt,
      questionnaireLayoutJson:
        config.questionnaireLayoutJson as Prisma.InputJsonValue,
    };
  }

  private sportAreaPromptVersionContent(prompt: {
    specializationId: string;
    areaId: string;
    basePrompt: string;
    isEnabledDriver: boolean;
    isActive: boolean;
  }): Prisma.InputJsonObject {
    return {
      specializationId: prompt.specializationId,
      areaId: prompt.areaId,
      basePrompt: prompt.basePrompt,
      isEnabledDriver: prompt.isEnabledDriver,
      isActive: prompt.isActive,
    };
  }

  private trainingPromptVersionContent(specialization: {
    id: string;
    trainingPrompt: string | null;
    trainingPromptActive: boolean;
  }): Prisma.InputJsonObject {
    return {
      specializationId: specialization.id,
      trainingPrompt: specialization.trainingPrompt,
      trainingPromptActive: specialization.trainingPromptActive,
    };
  }

  private async createGoalPromptVersion(
    tx: Prisma.TransactionClient,
    config: {
      id: string;
      name: string;
      basePrompt: string;
      version: number;
      isActive: boolean;
    },
    actorId: string | null,
  ) {
    const version = await tx.aiPromptVersion.create({
      data: {
        promptType: 'GOAL',
        version: config.version,
        contentJson: this.goalPromptVersionContent(config),
        goalPromptConfigId: config.id,
        createdById: actorId,
      },
      select: { id: true },
    });
    return tx.aiGoalPromptConfig.update({
      where: { id: config.id },
      data: { activePromptVersionId: version.id },
    });
  }

  private async createAreaGenerationPromptVersion(
    tx: Prisma.TransactionClient,
    config: {
      id: string;
      areaId: string;
      initialContext: string;
      responseFormatPrompt: string;
      questionnaireLayoutJson: unknown;
      version: number;
    },
    actorId: string | null,
  ) {
    const version = await tx.aiPromptVersion.create({
      data: {
        promptType: 'AREA_GENERATION',
        version: config.version,
        contentJson: this.areaGenerationVersionContent(config),
        areaGenerationConfigId: config.id,
        createdById: actorId,
      },
      select: { id: true },
    });
    return tx.aiAreaGenerationConfig.update({
      where: { id: config.id },
      data: { activePromptVersionId: version.id },
    });
  }

  private async createSportAreaPromptVersion(
    tx: Prisma.TransactionClient,
    prompt: {
      id: string;
      specializationId: string;
      areaId: string;
      basePrompt: string;
      version: number;
      isEnabledDriver: boolean;
      isActive: boolean;
    },
    actorId: string | null,
  ) {
    const version = await tx.aiPromptVersion.create({
      data: {
        promptType: 'SPORT_AREA',
        version: prompt.version,
        contentJson: this.sportAreaPromptVersionContent(prompt),
        sportSpecializationAreaPromptId: prompt.id,
        createdById: actorId,
      },
      select: { id: true },
    });
    return tx.sportSpecializationAreaPrompt.update({
      where: { id: prompt.id },
      data: { activePromptVersionId: version.id },
    });
  }

  private async createTrainingPromptVersion(
    tx: Prisma.TransactionClient,
    specialization: {
      id: string;
      trainingPrompt: string | null;
      trainingPromptVersion: number;
      trainingPromptActive: boolean;
    },
    actorId: string | null,
  ) {
    if (!specialization.trainingPrompt) {
      return specialization;
    }
    const version = await tx.aiPromptVersion.create({
      data: {
        promptType: 'TRAINING',
        version: specialization.trainingPromptVersion,
        contentJson: this.trainingPromptVersionContent(specialization),
        sportSpecializationId: specialization.id,
        createdById: actorId,
      },
      select: { id: true },
    });
    return tx.sportSpecialization.update({
      where: { id: specialization.id },
      data: { activeTrainingPromptVersionId: version.id },
    });
  }

  async getDashboard() {
    const [
      users,
      areas,
      professionals,
      pendingCycles,
      readyCycles,
      pendingQuestionApprovals,
      pendingPlanItems,
      sports,
      pendingTrainingPlans,
      readyTrainingPlans,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'USER' },
        orderBy: { email: 'asc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          createdAt: true,
          onboardingAssessment: {
            select: { status: true, completedAt: true },
          },
          sportSelection: {
            select: {
              specializationId: true,
              sport: { select: { id: true, label: true } },
              specialization: { select: { id: true, label: true } },
            },
          },
          userLinks: {
            select: {
              professionalId: true,
              areaId: true,
              professional: { select: { id: true, email: true } },
              area: { select: { id: true, name: true } },
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          athleteCoachLinks: {
            select: {
              coachId: true,
              specializationId: true,
              coach: { select: { id: true, email: true } },
              specialization: {
                select: {
                  id: true,
                  label: true,
                  sport: { select: { id: true, label: true } },
                },
              },
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          planReleases: {
            where: { status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } },
            select: {
              id: true,
              areaId: true,
              version: true,
              status: true,
              cycleStatus: true,
              createdAt: true,
              publishedAt: true,
              area: { select: { id: true, name: true } },
              items: { select: { status: true } },
              questionSets: {
                select: { status: true, closedAt: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          trainingPlanReleases: {
            where: { status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } },
            select: {
              id: true,
              version: true,
              status: true,
              cycleStatus: true,
              createdAt: true,
              publishedAt: true,
              summaryText: true,
              specialization: {
                select: {
                  id: true,
                  label: true,
                  sport: { select: { id: true, label: true } },
                },
              },
              items: { select: { status: true } },
              questionSets: {
                select: {
                  status: true,
                  approvals: {
                    select: {
                      status: true,
                      coach: { select: { id: true, email: true } },
                    },
                  },
                },
                take: 1,
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          questionSets: {
            where: { status: { in: ['PUBLISHED', 'PENDING_APPROVAL'] } },
            select: {
              id: true,
              areaId: true,
              status: true,
              createdAt: true,
              publishedAt: true,
              closedAt: true,
              area: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
          performanceProfileSnapshots: {
            select: {
              id: true,
              rankingGlobal: true,
              createdAt: true,
              areas: {
                select: {
                  areaId: true,
                  realR: true,
                  potentialP: true,
                  area: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.area.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { role: 'PROFESSIONAL' },
        orderBy: { email: 'asc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          professionalAreaCompetences: {
            select: {
              areaId: true,
              area: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          professionalLinks: {
            select: {
              userId: true,
              areaId: true,
              user: { select: { id: true, email: true } },
              area: { select: { id: true, name: true } },
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          coachSpecializationCompetences: {
            select: {
              specializationId: true,
              specialization: {
                select: {
                  id: true,
                  label: true,
                  sport: { select: { id: true, label: true } },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          coachUserLinks: {
            select: {
              userId: true,
              specializationId: true,
              user: { select: { id: true, email: true } },
              specialization: {
                select: {
                  id: true,
                  label: true,
                  sport: { select: { id: true, label: true } },
                },
              },
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.improvementPlanRelease.findMany({
        where: { status: 'PENDING_APPROVAL' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          areaId: true,
          version: true,
          status: true,
          cycleStatus: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
          area: { select: { id: true, name: true } },
          items: { select: { id: true, status: true } },
          questionSets: {
            select: {
              id: true,
              status: true,
              approvals: {
                select: {
                  id: true,
                  status: true,
                  professional: { select: { id: true, email: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.improvementPlanRelease.findMany({
        where: { status: 'PENDING_APPROVAL', cycleStatus: 'READY_TO_PUBLISH' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          areaId: true,
          version: true,
          cycleStatus: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
          area: { select: { id: true, name: true } },
        },
      }),
      this.prisma.questionSetAreaApproval.findMany({
        where: { status: 'PENDING' },
        select: {
          id: true,
          professionalId: true,
          areaId: true,
          professional: { select: { id: true, email: true } },
          area: { select: { id: true, name: true } },
          questionSet: {
            select: {
              id: true,
              user: { select: { id: true, email: true } },
              planReleaseId: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.planItem.findMany({
        where: {
          status: 'PROPOSED',
          planRelease: { status: 'PENDING_APPROVAL' },
        },
        select: {
          id: true,
          areaId: true,
          area: { select: { id: true, name: true } },
          planRelease: {
            select: {
              id: true,
              user: { select: { id: true, email: true } },
              userId: true,
              questionSets: {
                select: {
                  approvals: {
                    select: {
                      professional: { select: { id: true, email: true } },
                    },
                    take: 1,
                  },
                },
                take: 1,
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.sport.findMany({
        where: { isActive: true },
        select: {
          id: true,
          label: true,
          specializations: {
            where: { isActive: true },
            select: { id: true, label: true },
            orderBy: { label: 'asc' },
          },
        },
        orderBy: { label: 'asc' },
      }),
      this.prisma.trainingPlanRelease.findMany({
        where: { status: 'PENDING_APPROVAL' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          specializationId: true,
          version: true,
          status: true,
          cycleStatus: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
          specialization: {
            select: {
              id: true,
              label: true,
              sport: { select: { id: true, label: true } },
            },
          },
          items: { select: { id: true, status: true } },
          questionSets: {
            select: {
              id: true,
              status: true,
              approvals: {
                select: {
                  id: true,
                  status: true,
                  coach: { select: { id: true, email: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.trainingPlanRelease.findMany({
        where: { status: 'PENDING_APPROVAL', cycleStatus: 'READY_TO_PUBLISH' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          specializationId: true,
          version: true,
          cycleStatus: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
          specialization: {
            select: {
              id: true,
              label: true,
              sport: { select: { id: true, label: true } },
            },
          },
        },
      }),
    ]);

    const linkedProfessionalFor = (userId: string, areaId: string) => {
      const user = users.find((item) => item.id === userId);
      return (
        user?.userLinks.find((link) => link.areaId === areaId)?.professional ??
        null
      );
    };

    const pendingQuestionApprovalsWithRouting = pendingQuestionApprovals.map(
      (approval) => {
        const currentProfessional = linkedProfessionalFor(
          approval.questionSet.user.id,
          approval.areaId,
        );
        return {
          ...approval,
          currentProfessional,
          routingMismatch:
            Boolean(currentProfessional) &&
            currentProfessional?.id !== approval.professionalId,
        };
      },
    );

    const pendingPlanItemsByProfessional = pendingPlanItems.map((item) => ({
      id: item.id,
      area: item.area,
      planReleaseId: item.planRelease.id,
      user: item.planRelease.user,
      professional:
        linkedProfessionalFor(item.planRelease.userId, item.areaId) ??
        item.planRelease.questionSets[0]?.approvals[0]?.professional ??
        null,
    }));

    const athletes = users.map((user) => {
      const latestSnapshot = user.performanceProfileSnapshots[0] ?? null;
      const areaStates = areas.map((area) => {
        const link = user.userLinks.find((item) => item.areaId === area.id);
        const pending = user.planReleases.find(
          (plan) =>
            plan.areaId === area.id && plan.status === 'PENDING_APPROVAL',
        );
        const active = user.planReleases.find(
          (plan) => plan.areaId === area.id && plan.status === 'ACTIVE',
        );
        const questionSet = user.questionSets.find(
          (set) => set.areaId === area.id,
        );
        const snapshotArea = latestSnapshot?.areas.find(
          (snapshot) => snapshot.areaId === area.id,
        );
        const activeActivitiesCompleted =
          !active ||
          (active.items.length > 0 &&
            active.items.every((item) => item.status === 'COMPLETED'));
        const activeQuestionnaireCompleted =
          !active || active.questionSets.some((set) => set.status === 'CLOSED');
        const activeCycleCompleted =
          activeActivitiesCompleted && activeQuestionnaireCompleted;
        const generationBlocked =
          !user.isActive ||
          Boolean(pending) ||
          (user.onboardingAssessment?.status === 'COMPLETED' &&
            !activeCycleCompleted);
        const generationReady =
          user.isActive &&
          user.onboardingAssessment?.status === 'COMPLETED' &&
          !pending &&
          activeCycleCompleted;

        return {
          area,
          snapshot: snapshotArea
            ? {
                realR: snapshotArea.realR,
                potentialP: snapshotArea.potentialP,
              }
            : null,
          pendingCycle: pending ?? null,
          activeCycle: active ?? null,
          currentQuestionSet: questionSet ?? null,
          linkedProfessional: link?.professional ?? null,
          generationReady,
          generationBlocked,
          reason: generationBlocked
            ? pending
              ? 'Approvazione gia in attesa'
              : !user.isActive
                ? 'Atleta in attesa di attivazione amministratore'
                : !activeActivitiesCompleted
                  ? 'Attivita precedente non completata'
                  : 'Questionario precedente non completato'
            : generationReady
              ? active
                ? 'Pronto per il prossimo ciclo'
                : 'Pronto per la prima proposta AI'
              : 'Onboarding non completato',
        };
      });

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive,
        createdAt: user.createdAt,
        onboarding: user.onboardingAssessment ?? {
          status: 'PENDING',
          completedAt: null,
        },
        linkedProfessionals: user.userLinks.map((link) => ({
          area: link.area,
          professional: link.professional,
          createdAt: link.createdAt,
        })),
        latestSnapshot,
        trainingState: {
          sportSelection: user.sportSelection,
          linkedCoach: user.sportSelection
            ? (user.athleteCoachLinks.find(
                (link) =>
                  link.specializationId ===
                  user.sportSelection?.specializationId,
              )?.coach ?? null)
            : null,
          pendingTraining:
            user.trainingPlanReleases.find(
              (training) => training.status === 'PENDING_APPROVAL',
            ) ?? null,
          activeTraining:
            user.trainingPlanReleases.find(
              (training) => training.status === 'ACTIVE',
            ) ?? null,
          generationReady:
            user.isActive &&
            user.onboardingAssessment?.status === 'COMPLETED' &&
            Boolean(user.sportSelection) &&
            Boolean(
              user.sportSelection &&
              user.athleteCoachLinks.some(
                (link) =>
                  link.specializationId ===
                  user.sportSelection?.specializationId,
              ),
            ) &&
            !user.trainingPlanReleases.some(
              (training) => training.status === 'PENDING_APPROVAL',
            ),
          reason: !user.isActive
            ? 'Atleta in attesa di attivazione amministratore'
            : user.onboardingAssessment?.status !== 'COMPLETED'
              ? 'Onboarding non completato'
              : !user.sportSelection
                ? 'Sport-specializzazione non selezionata'
                : !user.athleteCoachLinks.some(
                      (link) =>
                        link.specializationId ===
                        user.sportSelection?.specializationId,
                    )
                  ? 'Allenatore non assegnato'
                  : user.trainingPlanReleases.some(
                        (training) => training.status === 'PENDING_APPROVAL',
                      )
                    ? 'Allenamento gia in approvazione'
                    : user.trainingPlanReleases.some(
                          (training) => training.status === 'ACTIVE',
                        )
                      ? 'Pronto per rigenerare allenamento'
                      : 'Pronto per il primo allenamento',
        },
        areaStates,
      };
    });

    return {
      areas,
      athletes,
      professionals,
      pendingCycles,
      readyCycles,
      pendingTrainingPlans,
      readyTrainingPlans,
      pendingQuestionApprovals: pendingQuestionApprovalsWithRouting,
      pendingPlanItems: pendingPlanItemsByProfessional,
      sports,
    };
  }

  async setUserActive(userId: string, isActive: boolean) {
    if (!userId) {
      throw new BadRequestException('ID utente mancante');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user || user.role !== UserRole.USER) {
      throw new NotFoundException('Atleta non trovato');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive,
        onboardingAssessment: {
          upsert: {
            update: {},
            create: { status: 'PENDING' },
          },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        role: true,
      },
    });
  }

  async rejectUserApplication(userId: string) {
    if (!userId) {
      throw new BadRequestException('ID utente mancante');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });
    if (!user || user.role !== UserRole.USER) {
      throw new NotFoundException('Atleta non trovato');
    }
    if (user.isActive) {
      throw new BadRequestException(
        'Puoi rifiutare solo una candidatura atleta in attesa',
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        onboardingAssessment: {
          upsert: {
            update: {
              status: 'REJECTED',
              answersJson: Prisma.JsonNull,
              profileJson: Prisma.JsonNull,
              completedAt: null,
            },
            create: { status: 'REJECTED' },
          },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        role: true,
        onboardingAssessment: { select: { status: true } },
      },
    });
  }

  async resetUserOperationalData(userId: string) {
    if (!userId) {
      throw new BadRequestException('ID utente mancante');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });
    if (!user || user.role !== UserRole.USER) {
      throw new NotFoundException('Atleta non trovato');
    }

    return this.prisma.$transaction(async (tx) => {
      const questionSetIds = (
        await tx.questionSet.findMany({
          where: { userId },
          select: { id: true },
        })
      ).map((item) => item.id);
      const planReleaseIds = (
        await tx.improvementPlanRelease.findMany({
          where: { userId },
          select: { id: true },
        })
      ).map((item) => item.id);
      const trainingPlanReleaseIds = (
        await tx.trainingPlanRelease.findMany({
          where: { userId },
          select: { id: true },
        })
      ).map((item) => item.id);
      const snapshotIds = (
        await tx.performanceProfileSnapshot.findMany({
          where: { userId },
          select: { id: true },
        })
      ).map((item) => item.id);
      const questionIds = questionSetIds.length
        ? (
            await tx.question.findMany({
              where: { questionSetId: { in: questionSetIds } },
              select: { id: true },
            })
          ).map((item) => item.id)
        : [];
      const trainingQuestionSetIds = (
        await tx.trainingQuestionSet.findMany({
          where: {
            OR: [
              { userId },
              ...(trainingPlanReleaseIds.length
                ? [
                    {
                      trainingPlanReleaseId: {
                        in: trainingPlanReleaseIds,
                      },
                    },
                  ]
                : []),
            ],
          },
          select: { id: true },
        })
      ).map((item) => item.id);
      const trainingQuestionIds = trainingQuestionSetIds.length
        ? (
            await tx.trainingQuestion.findMany({
              where: {
                trainingQuestionSetId: { in: trainingQuestionSetIds },
              },
              select: { id: true },
            })
          ).map((item) => item.id)
        : [];
      const aiProposalAuditWhere: Prisma.AiProposalAuditWhereInput[] = [
        { userId },
      ];
      if (planReleaseIds.length) {
        aiProposalAuditWhere.push({ planReleaseId: { in: planReleaseIds } });
      }
      if (questionSetIds.length) {
        aiProposalAuditWhere.push({ questionSetId: { in: questionSetIds } });
      }
      const aiContextSummaryWhere: Prisma.AiContextSummaryWhereInput[] = [
        { userId },
      ];
      if (planReleaseIds.length) {
        aiContextSummaryWhere.push({ planReleaseId: { in: planReleaseIds } });
      }
      const userAnswerWhere: Prisma.UserAnswerWhereInput[] = [{ userId }];
      if (questionIds.length) {
        userAnswerWhere.push({ questionId: { in: questionIds } });
      }
      const trainingUserAnswerWhere: Prisma.TrainingUserAnswerWhereInput[] = [
        { userId },
      ];
      if (trainingQuestionIds.length) {
        trainingUserAnswerWhere.push({
          trainingQuestionId: { in: trainingQuestionIds },
        });
      }

      const deleted = {
        consents: (await tx.consent.deleteMany({ where: { userId } })).count,
        dataAccessAudits: (
          await tx.dataAccessAudit.deleteMany({
            where: { OR: [{ targetUserId: userId }, { actorId: userId }] },
          })
        ).count,
        cycleAuditLogs: (
          await tx.cycleAuditLog.deleteMany({
            where: { OR: [{ userId }, { actorId: userId }] },
          })
        ).count,
        aiProposalAudits: (
          await tx.aiProposalAudit.deleteMany({
            where: {
              OR: aiProposalAuditWhere,
            },
          })
        ).count,
        aiContextSummaries: (
          await tx.aiContextSummary.deleteMany({
            where: {
              OR: aiContextSummaryWhere,
            },
          })
        ).count,
        aiCycleHistorySummaries: (
          await tx.aiCycleHistorySummary.deleteMany({ where: { userId } })
        ).count,
        questionSetApprovals: questionSetIds.length
          ? (
              await tx.questionSetAreaApproval.deleteMany({
                where: { questionSetId: { in: questionSetIds } },
              })
            ).count
          : 0,
        userAnswers: (
          await tx.userAnswer.deleteMany({
            where: {
              OR: userAnswerWhere,
            },
          })
        ).count,
        answerOptions: questionIds.length
          ? (
              await tx.answerOption.deleteMany({
                where: { questionId: { in: questionIds } },
              })
            ).count
          : 0,
        questions: questionSetIds.length
          ? (
              await tx.question.deleteMany({
                where: { questionSetId: { in: questionSetIds } },
              })
            ).count
          : 0,
        questionSets: (await tx.questionSet.deleteMany({ where: { userId } }))
          .count,
        planItems: planReleaseIds.length
          ? (
              await tx.planItem.deleteMany({
                where: { planReleaseId: { in: planReleaseIds } },
              })
            ).count
          : 0,
        planReleases: (
          await tx.improvementPlanRelease.deleteMany({ where: { userId } })
        ).count,
        trainingUserAnswers: (
          await tx.trainingUserAnswer.deleteMany({
            where: { OR: trainingUserAnswerWhere },
          })
        ).count,
        trainingAnswerOptions: trainingQuestionIds.length
          ? (
              await tx.trainingAnswerOption.deleteMany({
                where: { trainingQuestionId: { in: trainingQuestionIds } },
              })
            ).count
          : 0,
        trainingQuestions: trainingQuestionSetIds.length
          ? (
              await tx.trainingQuestion.deleteMany({
                where: {
                  trainingQuestionSetId: { in: trainingQuestionSetIds },
                },
              })
            ).count
          : 0,
        trainingQuestionSetApprovals: trainingQuestionSetIds.length
          ? (
              await tx.trainingQuestionSetCoachApproval.deleteMany({
                where: {
                  trainingQuestionSetId: { in: trainingQuestionSetIds },
                },
              })
            ).count
          : 0,
        trainingQuestionSets: (
          await tx.trainingQuestionSet.deleteMany({ where: { userId } })
        ).count,
        trainingPlanItems: trainingPlanReleaseIds.length
          ? (
              await tx.trainingPlanItem.deleteMany({
                where: {
                  trainingPlanReleaseId: { in: trainingPlanReleaseIds },
                },
              })
            ).count
          : 0,
        trainingPlanReleases: (
          await tx.trainingPlanRelease.deleteMany({ where: { userId } })
        ).count,
        snapshotAreas: snapshotIds.length
          ? (
              await tx.performanceProfileSnapshotArea.deleteMany({
                where: { snapshotId: { in: snapshotIds } },
              })
            ).count
          : 0,
        snapshots: (
          await tx.performanceProfileSnapshot.deleteMany({ where: { userId } })
        ).count,
        professionalLinks: (
          await tx.professionalUserLink.deleteMany({
            where: { OR: [{ userId }, { professionalId: userId }] },
          })
        ).count,
        coachLinks: (
          await tx.coachUserLink.deleteMany({
            where: { OR: [{ userId }, { coachId: userId }] },
          })
        ).count,
        feedbackEntries: (
          await tx.feedbackEntry.deleteMany({ where: { userId } })
        ).count,
        assignments: (await tx.userAssignment.deleteMany({ where: { userId } }))
          .count,
        currentStates: (await tx.currentState.deleteMany({ where: { userId } }))
          .count,
        kpiDaily: (await tx.kpiDaily.deleteMany({ where: { userId } })).count,
        aiInteractions: (
          await tx.aiInteraction.deleteMany({ where: { userId } })
        ).count,
        onboardingQuestions: (
          await tx.userOnboardingQuestion.deleteMany({ where: { userId } })
        ).count,
        sportSelection: (
          await tx.userSportSelection.deleteMany({ where: { userId } })
        ).count,
        areaPromptInstructions: (
          await tx.userAreaPromptInstruction.deleteMany({ where: { userId } })
        ).count,
        performanceGoal: (
          await tx.userPerformanceGoal.deleteMany({ where: { userId } })
        ).count,
        onboardingAssessment: (
          await tx.userOnboardingAssessment.deleteMany({ where: { userId } })
        ).count,
      };

      const resetUser = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          role: true,
          onboardingAssessment: { select: { status: true } },
        },
      });

      const residual = {
        consents: await tx.consent.count({ where: { userId } }),
        onboardingAssessment: await tx.userOnboardingAssessment.count({
          where: { userId },
        }),
        onboardingQuestions: await tx.userOnboardingQuestion.count({
          where: { userId },
        }),
        sportSelection: await tx.userSportSelection.count({
          where: { userId },
        }),
        performanceGoal: await tx.userPerformanceGoal.count({
          where: { userId },
        }),
        areaPromptInstructions: await tx.userAreaPromptInstruction.count({
          where: { userId },
        }),
        planReleases: await tx.improvementPlanRelease.count({
          where: { userId },
        }),
        trainingPlanReleases: await tx.trainingPlanRelease.count({
          where: { userId },
        }),
        questionSets: await tx.questionSet.count({ where: { userId } }),
        trainingQuestionSets: await tx.trainingQuestionSet.count({
          where: { userId },
        }),
        userAnswers: await tx.userAnswer.count({ where: { userId } }),
        trainingUserAnswers: await tx.trainingUserAnswer.count({
          where: { userId },
        }),
        snapshots: await tx.performanceProfileSnapshot.count({
          where: { userId },
        }),
        professionalLinks: await tx.professionalUserLink.count({
          where: { OR: [{ userId }, { professionalId: userId }] },
        }),
        coachLinks: await tx.coachUserLink.count({
          where: { OR: [{ userId }, { coachId: userId }] },
        }),
        feedbackEntries: await tx.feedbackEntry.count({ where: { userId } }),
        assignments: await tx.userAssignment.count({ where: { userId } }),
        currentStates: await tx.currentState.count({ where: { userId } }),
        kpiDaily: await tx.kpiDaily.count({ where: { userId } }),
        aiInteractions: await tx.aiInteraction.count({ where: { userId } }),
        aiContextSummaries: await tx.aiContextSummary.count({
          where: { userId },
        }),
        aiCycleHistorySummaries: await tx.aiCycleHistorySummary.count({
          where: { userId },
        }),
        aiProposalAudits: await tx.aiProposalAudit.count({ where: { userId } }),
        dataAccessAudits: await tx.dataAccessAudit.count({
          where: { OR: [{ targetUserId: userId }, { actorId: userId }] },
        }),
        cycleAuditLogs: await tx.cycleAuditLog.count({
          where: { OR: [{ userId }, { actorId: userId }] },
        }),
      };

      return { user: resetUser, deleted, residual };
    });
  }

  async deleteAthleteCompletely(userId: string) {
    if (!userId) {
      throw new BadRequestException('ID utente mancante');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });
    if (!user || user.role !== UserRole.USER) {
      throw new NotFoundException('Atleta non trovato');
    }

    const reset = await this.resetUserOperationalData(userId);

    return this.prisma.$transaction(async (tx) => {
      const deleted = {
        ...reset.deleted,
        authIdentities: (
          await tx.authIdentity.deleteMany({ where: { userId } })
        ).count,
      };
      await tx.user.delete({ where: { id: userId } });

      return {
        deleted: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        deletedCounts: deleted,
      };
    });
  }

  async getAiSettings() {
    const areas = await this.prisma.area.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    await this.ensureAreaGenerationConfigs(areas.map((area) => area.id));
    await this.ensureGoalPromptConfig();
    await this.ensureSportPromptCoverage(areas);

    const [
      goalPromptConfig,
      goalPromptConfigs,
      areaGenerationConfigs,
      sports,
      onboardingTemplates,
    ] = await Promise.all([
      this.prisma.aiGoalPromptConfig.findFirst({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          basePrompt: true,
          version: true,
          isActive: true,
          activePromptVersionId: true,
          activePromptVersion: {
            select: { id: true, version: true, createdAt: true },
          },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.aiGoalPromptConfig.findMany({
        select: {
          id: true,
          name: true,
          basePrompt: true,
          version: true,
          isActive: true,
          activePromptVersionId: true,
          activePromptVersion: {
            select: { id: true, version: true, createdAt: true },
          },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.aiAreaGenerationConfig.findMany({
        select: {
          id: true,
          areaId: true,
          initialContext: true,
          responseFormatPrompt: true,
          questionnaireLayoutJson: true,
          version: true,
          activePromptVersionId: true,
          activePromptVersion: {
            select: { id: true, version: true, createdAt: true },
          },
          updatedAt: true,
          area: { select: { id: true, name: true } },
        },
        orderBy: [{ area: { name: 'asc' } }],
      }),
      this.prisma.sport.findMany({
        select: {
          id: true,
          key: true,
          label: true,
          isActive: true,
          specializations: {
            select: {
              id: true,
              key: true,
              label: true,
              trainingPrompt: true,
              trainingPromptVersion: true,
              trainingPromptActive: true,
              activeTrainingPromptVersionId: true,
              activeTrainingPromptVersion: {
                select: { id: true, version: true, createdAt: true },
              },
              isActive: true,
              updatedAt: true,
              prompts: {
                select: {
                  id: true,
                  areaId: true,
                  basePrompt: true,
                  isEnabledDriver: true,
                  version: true,
                  isActive: true,
                  activePromptVersionId: true,
                  activePromptVersion: {
                    select: { id: true, version: true, createdAt: true },
                  },
                  updatedAt: true,
                  area: { select: { id: true, name: true } },
                },
                orderBy: [{ area: { name: 'asc' } }],
              },
            },
            orderBy: { label: 'asc' },
          },
        },
        orderBy: { label: 'asc' },
      }),
      this.prisma.onboardingQuestionTemplate.findMany({
        select: {
          id: true,
          key: true,
          scope: true,
          areaId: true,
          label: true,
          helpText: true,
          inputType: true,
          optionsJson: true,
          required: true,
          orderIndex: true,
          isActive: true,
          updatedAt: true,
          area: { select: { id: true, name: true } },
        },
        orderBy: [{ scope: 'asc' }, { areaId: 'asc' }, { orderIndex: 'asc' }],
      }),
    ]);

    return {
      areas,
      sports,
      goalPromptConfig,
      goalPromptConfigs,
      areaGenerationConfigs,
      onboardingTemplates,
      inputTypes: Object.values(OnboardingInputType),
      scopes: Object.values(OnboardingQuestionScope),
    };
  }

  private async ensureAreaGenerationConfigs(areaIds: string[]) {
    if (!areaIds.length) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const areaId of areaIds) {
        const existing = await tx.aiAreaGenerationConfig.findUnique({
          where: { areaId },
          select: { id: true, activePromptVersionId: true },
        });
        if (existing) {
          continue;
        }
        const config = await tx.aiAreaGenerationConfig.create({
          data: {
            id: `area-generation-config-${areaId}`,
            areaId,
            initialContext: DEFAULT_INITIAL_CONTEXT,
            responseFormatPrompt: DEFAULT_RESPONSE_FORMAT_PROMPT,
            questionnaireLayoutJson: DEFAULT_QUESTIONNAIRE_LAYOUT_JSON,
          },
        });
        await this.createAreaGenerationPromptVersion(tx, config, null);
      }

      const missingHistory = await tx.aiAreaGenerationConfig.findMany({
        where: {
          areaId: { in: areaIds },
          activePromptVersionId: null,
        },
      });
      for (const config of missingHistory) {
        await this.createAreaGenerationPromptVersion(tx, config, null);
      }
    });
  }

  private async ensureGoalPromptConfig() {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiGoalPromptConfig.findUnique({
        where: { id: 'goal-prompt-default' },
      });
      const config =
        existing ??
        (await tx.aiGoalPromptConfig.create({
          data: {
            id: 'goal-prompt-default',
            name: 'obiettivo',
            basePrompt: DEFAULT_GOAL_PROMPT,
            isActive: true,
          },
        }));
      if (!config.activePromptVersionId) {
        await this.createGoalPromptVersion(tx, config, null);
      }
    });
  }

  private async ensureSportPromptCoverage(
    areas: Array<{ id: string; name: string }>,
  ) {
    if (!areas.length) {
      return;
    }

    const specializations = await this.prisma.sportSpecialization.findMany({
      select: {
        id: true,
        label: true,
        sport: { select: { label: true } },
      },
    });
    for (const specialization of specializations) {
      await this.prisma.sportSpecialization.updateMany({
        where: { id: specialization.id, trainingPrompt: null },
        data: {
          trainingPrompt: this.defaultTrainingPrompt(
            `${specialization.sport.label} - ${specialization.label}`,
          ),
        },
      });
      await this.prisma.sportSpecializationAreaPrompt.createMany({
        data: areas.map((area) => ({
          specializationId: specialization.id,
          areaId: area.id,
          basePrompt: this.defaultSportSpecializationAreaPrompt(
            `${specialization.sport.label} - ${specialization.label}`,
            area.name,
          ),
        })),
        skipDuplicates: true,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const trainingPrompts = await tx.sportSpecialization.findMany({
        where: {
          trainingPrompt: { not: null },
          activeTrainingPromptVersionId: null,
        },
        select: {
          id: true,
          trainingPrompt: true,
          trainingPromptVersion: true,
          trainingPromptActive: true,
        },
      });
      for (const specialization of trainingPrompts) {
        await this.createTrainingPromptVersion(tx, specialization, null);
      }

      const areaPrompts = await tx.sportSpecializationAreaPrompt.findMany({
        where: { activePromptVersionId: null },
      });
      for (const prompt of areaPrompts) {
        await this.createSportAreaPromptVersion(tx, prompt, null);
      }
    });
  }

  private defaultSportSpecializationAreaPrompt(
    sportLabel: string,
    areaName: string,
  ) {
    return [
      `Adatta l area ${areaName} allo scenario sportivo ${sportLabel}.`,
      'Usa questa scelta come vincolo prioritario quando interpreti obiettivo, anamnesi e domande specialistiche.',
      'Mantieni il lavoro specifico per il contesto scelto, pratico, misurabile, progressivo e revisionabile da un professionista.',
    ].join(' ');
  }

  private defaultTrainingPrompt(sportLabel: string) {
    const normalized = sportLabel.toLowerCase();
    if (
      (normalized.includes('corsa') || normalized.includes('running')) &&
      (normalized.includes('strada') || normalized.includes('road'))
    ) {
      return RUNNING_ROAD_TRAINING_PROMPT;
    }
    return [
      `Genera l allenamento specifico per ${sportLabel}.`,
      'Usa obiettivo, anamnesi, storico, carico e segnali di recupero.',
      'Produci un lavoro pratico, progressivo, misurabile e revisionabile da un professionista.',
    ].join(' ');
  }

  async upsertGoalPromptConfig(
    body: UpsertGoalPromptConfigDto,
    actorId: string,
  ) {
    const name = body.name?.trim() || 'obiettivo';
    const basePrompt = body.basePrompt?.trim();
    const isActive = body.isActive ?? true;
    if (!actorId || !name || !basePrompt) {
      throw new BadRequestException('Dati prompt obiettivo mancanti');
    }

    if (body.id) {
      const existing = await this.prisma.aiGoalPromptConfig.findUnique({
        where: { id: body.id },
        select: { id: true, name: true },
      });
      if (!existing) {
        throw new NotFoundException(
          'Configurazione prompt obiettivo non trovata',
        );
      }

      return this.prisma.$transaction(async (tx) => {
        if (isActive) {
          const activeConfigs = await tx.aiGoalPromptConfig.findMany({
            where: { isActive: true, id: { not: body.id } },
          });
          for (const activeConfig of activeConfigs) {
            const deactivated = await tx.aiGoalPromptConfig.update({
              where: { id: activeConfig.id },
              data: {
                isActive: false,
                version: { increment: 1 },
                updatedById: actorId,
              },
            });
            await this.createGoalPromptVersion(tx, deactivated, actorId);
          }
        }
        const updated = await tx.aiGoalPromptConfig.update({
          where: { id: body.id },
          data: {
            name,
            basePrompt,
            isActive,
            version: { increment: 1 },
            updatedById: actorId,
          },
        });
        return this.createGoalPromptVersion(tx, updated, actorId);
      });
    }

    return this.prisma.$transaction(async (tx) => {
      if (isActive) {
        const activeConfigs = await tx.aiGoalPromptConfig.findMany({
          where: { isActive: true },
        });
        for (const activeConfig of activeConfigs) {
          const deactivated = await tx.aiGoalPromptConfig.update({
            where: { id: activeConfig.id },
            data: {
              isActive: false,
              version: { increment: 1 },
              updatedById: actorId,
            },
          });
          await this.createGoalPromptVersion(tx, deactivated, actorId);
        }
      }
      const created = await tx.aiGoalPromptConfig.create({
        data: {
          name,
          basePrompt,
          isActive,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      return this.createGoalPromptVersion(tx, created, actorId);
    });
  }

  async upsertSportCatalog(
    body: {
      id?: string;
      key?: string;
      label?: string;
      isActive?: boolean;
      specializations?: Array<{
        id?: string;
        key?: string;
        label?: string;
        trainingPrompt?: string;
        trainingPromptActive?: boolean;
        isActive?: boolean;
        prompts?: Array<{
          id?: string;
          areaId?: string;
          basePrompt?: string;
          isEnabledDriver?: boolean;
          isActive?: boolean;
        }>;
      }>;
    },
    actorId: string,
  ) {
    const key = body.key?.trim().toUpperCase();
    const label = body.label?.trim();
    if (!actorId || !key || !label) {
      throw new BadRequestException('Dati sport mancanti');
    }
    const specializations = body.specializations ?? [];
    if (!specializations.length) {
      throw new BadRequestException('Definisci almeno una specializzazione');
    }

    const areas = await this.prisma.area.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const areaIds = new Set(areas.map((area) => area.id));

    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.sport.findUnique({
        where: { key },
        select: { id: true },
      });
      if (duplicate && duplicate.id !== body.id) {
        throw new BadRequestException('Codice sport gia esistente');
      }

      const sport = body.id
        ? await tx.sport.update({
            where: { id: body.id },
            data: { key, label, isActive: body.isActive ?? true },
            select: { id: true, label: true },
          })
        : await tx.sport.create({
            data: { key, label, isActive: body.isActive ?? true },
            select: { id: true, label: true },
          });

      const incomingSpecializationIds = specializations
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id));
      await tx.sportSpecialization.deleteMany({
        where: {
          sportId: sport.id,
          id: { notIn: incomingSpecializationIds },
        },
      });

      for (const specializationInput of specializations) {
        const specializationKey = specializationInput.key?.trim().toUpperCase();
        const specializationLabel = specializationInput.label?.trim();
        const hasTrainingPrompt =
          specializationInput.trainingPrompt !== undefined;
        const trainingPrompt =
          specializationInput.trainingPrompt?.trim() ?? null;
        if (!specializationKey || !specializationLabel) {
          throw new BadRequestException(
            'Ogni specializzazione richiede codice e nome',
          );
        }
        const specialization = specializationInput.id
          ? await tx.sportSpecialization.update({
              where: { id: specializationInput.id },
              data: {
                key: specializationKey,
                label: specializationLabel,
                ...(hasTrainingPrompt
                  ? {
                      trainingPrompt: trainingPrompt || null,
                      trainingPromptVersion: { increment: 1 },
                    }
                  : {}),
                trainingPromptActive:
                  specializationInput.trainingPromptActive ?? true,
                isActive: specializationInput.isActive ?? true,
              },
              select: {
                id: true,
                label: true,
                trainingPrompt: true,
                trainingPromptVersion: true,
                trainingPromptActive: true,
              },
            })
          : await tx.sportSpecialization.create({
              data: {
                sportId: sport.id,
                key: specializationKey,
                label: specializationLabel,
                trainingPrompt:
                  trainingPrompt ||
                  this.defaultTrainingPrompt(
                    `${sport.label} - ${specializationLabel}`,
                  ),
                trainingPromptActive:
                  specializationInput.trainingPromptActive ?? true,
                isActive: specializationInput.isActive ?? true,
              },
              select: {
                id: true,
                label: true,
                trainingPrompt: true,
                trainingPromptVersion: true,
                trainingPromptActive: true,
              },
            });
        if (!specializationInput.id || hasTrainingPrompt) {
          await this.createTrainingPromptVersion(tx, specialization, actorId);
        }

        const prompts = specializationInput.prompts ?? [];
        for (const prompt of prompts) {
          const areaId = prompt.areaId?.trim();
          const basePrompt = prompt.basePrompt?.trim();
          if (!areaId || !areaIds.has(areaId) || !basePrompt) {
            continue;
          }
          const savedPrompt = await tx.sportSpecializationAreaPrompt.upsert({
            where: {
              specializationId_areaId: {
                specializationId: specialization.id,
                areaId,
              },
            },
            update: {
              basePrompt,
              isEnabledDriver: prompt.isEnabledDriver ?? true,
              isActive: prompt.isActive ?? true,
              version: { increment: 1 },
              updatedById: actorId,
            },
            create: {
              specializationId: specialization.id,
              areaId,
              basePrompt,
              isEnabledDriver: prompt.isEnabledDriver ?? true,
              isActive: prompt.isActive ?? true,
              createdById: actorId,
              updatedById: actorId,
            },
          });
          await this.createSportAreaPromptVersion(tx, savedPrompt, actorId);
        }

        for (const area of areas) {
          const savedPrompt = await tx.sportSpecializationAreaPrompt.upsert({
            where: {
              specializationId_areaId: {
                specializationId: specialization.id,
                areaId: area.id,
              },
            },
            update: {},
            create: {
              specializationId: specialization.id,
              areaId: area.id,
              basePrompt: this.defaultSportSpecializationAreaPrompt(
                `${sport.label} - ${specialization.label}`,
                area.name,
              ),
              isEnabledDriver: true,
              createdById: actorId,
              updatedById: actorId,
            },
          });
          if (!savedPrompt.activePromptVersionId) {
            await this.createSportAreaPromptVersion(tx, savedPrompt, actorId);
          }
        }
      }

      return tx.sport.findUnique({
        where: { id: sport.id },
        include: {
          specializations: {
            include: { prompts: { include: { area: true } } },
            orderBy: { label: 'asc' },
          },
        },
      });
    });
  }

  async deleteSport(sportId: string) {
    if (!sportId) {
      throw new BadRequestException('ID sport mancante');
    }
    const existing = await this.prisma.sport.findUnique({
      where: { id: sportId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Sport non trovato');
    }
    await this.prisma.sport.delete({ where: { id: sportId } });
    return { deleted: true };
  }

  async upsertAiAreaGenerationConfig(
    body: UpsertAiAreaGenerationConfigDto,
    actorId: string,
  ) {
    const areaId = body.areaId?.trim();
    const initialContext = body.initialContext?.trim();
    const responseFormatPrompt = body.responseFormatPrompt?.trim();

    if (!actorId || !areaId || !initialContext || !responseFormatPrompt) {
      throw new BadRequestException('Dati configurazione AI area mancanti');
    }
    if (
      body.questionnaireLayoutJson === undefined ||
      body.questionnaireLayoutJson === null ||
      Array.isArray(body.questionnaireLayoutJson) ||
      typeof body.questionnaireLayoutJson !== 'object'
    ) {
      throw new BadRequestException(
        'Il layout questionario deve essere un oggetto JSON',
      );
    }

    const area = await this.prisma.area.findUnique({
      where: { id: areaId },
      select: { id: true },
    });
    if (!area) {
      throw new BadRequestException('Area non valida');
    }

    if (body.id) {
      const existing = await this.prisma.aiAreaGenerationConfig.findUnique({
        where: { id: body.id },
        select: { id: true, areaId: true },
      });
      if (!existing) {
        throw new NotFoundException('Configurazione AI area non trovata');
      }
      if (existing.areaId !== areaId) {
        throw new BadRequestException(
          'Area cannot be changed for this configuration',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const config = await tx.aiAreaGenerationConfig.upsert({
        where: { areaId },
        update: {
          initialContext,
          responseFormatPrompt,
          questionnaireLayoutJson:
            body.questionnaireLayoutJson as Prisma.InputJsonValue,
          version: { increment: 1 },
          updatedById: actorId,
        },
        create: {
          areaId,
          initialContext,
          responseFormatPrompt,
          questionnaireLayoutJson:
            body.questionnaireLayoutJson as Prisma.InputJsonValue,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      return this.createAreaGenerationPromptVersion(tx, config, actorId);
    });
  }

  async upsertOnboardingTemplate(
    body: UpsertOnboardingTemplateDto,
    actorId: string,
  ) {
    const key = body.key?.trim();
    const label = body.label?.trim();
    if (!actorId || !key || !label || !body.scope || !body.inputType) {
      throw new BadRequestException('Dati template onboarding mancanti');
    }

    if (body.scope === OnboardingQuestionScope.AREA && !body.areaId) {
      throw new BadRequestException('Le domande area richiedono un area');
    }
    if (body.areaId) {
      const area = await this.prisma.area.findUnique({
        where: { id: body.areaId },
        select: { id: true },
      });
      if (!area) {
        throw new BadRequestException('Area non valida');
      }
    }

    const data = {
      key,
      scope: body.scope,
      areaId:
        body.scope === OnboardingQuestionScope.AREA
          ? (body.areaId ?? null)
          : null,
      label,
      helpText: body.helpText?.trim() || null,
      inputType: body.inputType,
      optionsJson:
        body.optionsJson === undefined
          ? Prisma.JsonNull
          : (body.optionsJson as Prisma.InputJsonValue),
      required: body.required ?? true,
      orderIndex: Number(body.orderIndex) || 0,
      isActive: body.isActive ?? true,
      updatedById: actorId,
    };

    if (body.id) {
      const existing = await this.prisma.onboardingQuestionTemplate.findUnique({
        where: { id: body.id },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('Template onboarding non trovato');
      }
      return this.prisma.onboardingQuestionTemplate.update({
        where: { id: body.id },
        data,
      });
    }

    return this.prisma.onboardingQuestionTemplate.create({
      data: {
        ...data,
        createdById: actorId,
      },
    });
  }

  async deleteOnboardingTemplate(id: string) {
    const existing = await this.prisma.onboardingQuestionTemplate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Template onboarding non trovato');
    }
    await this.prisma.onboardingQuestionTemplate.delete({ where: { id } });
    return { id, deleted: true };
  }
}
