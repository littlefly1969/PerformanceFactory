import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryService } from './discovery.service';
import { validAnswer } from './discovery-answer';
import { DiscoveryConfiguration, DiscoveryDraft } from './discovery.types';

/** Durata della bozza dall'ultima interazione valida (F1). */
export const QUIZ_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Una bozza contiene solo risposte brevi: niente testi liberi lunghi. */
const MAX_DRAFT_BYTES = 20_000;
const DRAFT_KEYS = [
  'version',
  'currentStep',
  'sportId',
  'specializationId',
  'goalId',
  'answers',
];

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/**
 * Bozza anonima del Quiz Funnel lato server (PF-FS-PREPAYWALL F1, AT-04). Il
 * token vive solo sul dispositivo e serve esclusivamente a riprendere il
 * proprio quiz: non identifica la persona e non entra negli eventi. Ogni
 * bozza conserva la configurazione con cui è iniziata; la registrazione la
 * collega all'account e la cancella nella stessa transazione (AT-06).
 */
@Injectable()
export class QuizDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
  ) {}

  async create(now = new Date()) {
    await this.prisma.quizDraft.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    const configuration = await this.discovery.configuration();
    const token = randomBytes(32).toString('base64url');
    const draft: DiscoveryDraft = {
      version: configuration.version,
      currentStep: 'intro',
      answers: {},
    };
    const saved = await this.prisma.quizDraft.create({
      data: {
        tokenHash: hash(token),
        version: BigInt(configuration.version),
        configuration: json(configuration),
        draft: json(draft),
        expiresAt: new Date(now.getTime() + QUIZ_DRAFT_TTL_MS),
      },
    });
    return { token, configuration, draft, expiresAt: saved.expiresAt };
  }

  /** Riprende la bozza: leggerla non è un'interazione e non la proroga. */
  async read(token: unknown, now = new Date()) {
    const row = await this.find(token, now);
    return {
      configuration: row.configuration as unknown as DiscoveryConfiguration,
      draft: row.draft as unknown as DiscoveryDraft,
      expiresAt: row.expiresAt,
    };
  }

  /** Salva il progresso sulla versione congelata e proroga di 7 giorni. */
  async save(token: unknown, input: unknown, now = new Date()) {
    const row = await this.find(token, now);
    const configuration =
      row.configuration as unknown as DiscoveryConfiguration;
    const draft = validateProgress(configuration, input);
    const expiresAt = new Date(now.getTime() + QUIZ_DRAFT_TTL_MS);
    const updated = await this.prisma.quizDraft.updateMany({
      where: { id: row.id, expiresAt: { gt: now } },
      data: { draft: json(draft), expiresAt },
    });
    if (!updated.count) throw expiredDraft();
    return { draft, expiresAt };
  }

  /** Ricomincia: la bozza sparisce dal server. */
  async remove(token: unknown) {
    if (typeof token === 'string' && token)
      await this.prisma.quizDraft.deleteMany({
        where: { tokenHash: hash(token) },
      });
  }

  /**
   * Collega la bozza alla registrazione nella transazione dell'account e la
   * cancella: un secondo uso dello stesso token fallisce, quindi nessun
   * doppio import. Restituisce la configurazione congelata e l'ultima bozza.
   */
  static async consume(
    tx: Prisma.TransactionClient,
    token: string,
    now = new Date(),
  ) {
    const row = await tx.quizDraft.findUnique({
      where: { tokenHash: hash(token) },
    });
    if (!row || row.expiresAt <= now) throw expiredDraft();
    const deleted = await tx.quizDraft.deleteMany({ where: { id: row.id } });
    if (!deleted.count)
      throw new ConflictException('La bozza del quiz è già stata usata');
    return {
      configuration: row.configuration as unknown as DiscoveryConfiguration,
      draft: row.draft as unknown as DiscoveryDraft,
    };
  }

  private async find(token: unknown, now: Date) {
    if (typeof token !== 'string' || !token || token.length > 100)
      throw expiredDraft();
    const row = await this.prisma.quizDraft.findUnique({
      where: { tokenHash: hash(token) },
    });
    if (!row || row.expiresAt <= now) {
      if (row)
        await this.prisma.quizDraft.deleteMany({ where: { id: row.id } });
      throw expiredDraft();
    }
    return row;
  }
}

const expiredDraft = () =>
  new NotFoundException('Bozza del quiz scaduta o non trovata');

/**
 * Progresso parziale: solo campi noti, versione congelata, risposte a
 * domande della configurazione e valori validi per il loro tipo. Le risposte
 * mancanti sono ammesse: la completezza si verifica alla registrazione.
 */
export function validateProgress(
  config: DiscoveryConfiguration,
  input: unknown,
): DiscoveryDraft {
  const fail = (message: string): never => {
    throw new BadRequestException(message);
  };
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return fail('Bozza mancante');
  if (JSON.stringify(input).length > MAX_DRAFT_BYTES)
    return fail('Bozza troppo grande');
  const draft = input as DiscoveryDraft;
  if (Object.keys(draft).some((key) => !DRAFT_KEYS.includes(key)))
    return fail('Campi della bozza non previsti');
  if (draft.version !== config.version)
    return fail('La bozza appartiene a un’altra versione del quiz');
  if (typeof draft.currentStep !== 'string' || draft.currentStep.length > 100)
    return fail('Passaggio non valido');
  if (
    !draft.answers ||
    typeof draft.answers !== 'object' ||
    Array.isArray(draft.answers)
  )
    return fail('Risposte non valide');
  const questions = new Map(
    config.questions.filter((q) => !q.target).map((q) => [q.id, q]),
  );
  for (const [id, value] of Object.entries(draft.answers)) {
    const question = questions.get(id);
    if (!question) return fail('Risposta a una domanda sconosciuta');
    if (!validAnswer({ ...question, required: false }, value, draft.sportId))
      return fail('Risposta non valida');
  }
  for (const target of ['sportId', 'specializationId', 'goalId'] as const) {
    const value = draft[target];
    if (value === undefined) continue;
    const question = config.questions.find((q) => q.target === target);
    if (
      !question ||
      !validAnswer({ ...question, required: false }, value, draft.sportId)
    )
      return fail('Risposta non valida');
  }
  return draft;
}
