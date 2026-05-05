import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  REQUIRED_CONSENT_TYPES,
  REQUIRED_CONSENTS,
  consentDocumentHash,
} from './consent-texts';

type ConsentAuditInput = {
  ipAddress?: string | null;
  userAgent?: string | null;
  source?: string | null;
};

type ConsentAcceptanceInput = {
  privacyAccepted?: boolean;
  aiAssistantAccepted?: boolean;
  acceptedDocuments?: Array<{
    type?: string;
    version?: string;
    documentHash?: string;
  }>;
};

@Injectable()
export class ConsentsService {
  constructor(private readonly prisma: PrismaService) {}

  fallbackRequiredDocuments() {
    return REQUIRED_CONSENTS.map((consent) => ({
      type: consent.type,
      version: consent.version,
      title: consent.title,
      summary: consent.summary,
      body: [...consent.body],
      documentHash: consentDocumentHash(consent),
    }));
  }

  async requiredDocuments() {
    await this.ensureDefaultDocuments();
    const activeDocuments = await this.prisma.consentDocument.findMany({
      where: {
        type: { in: REQUIRED_CONSENTS.map((consent) => consent.type) },
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const activeByType = new Map(
      activeDocuments.map((document) => [document.type, document]),
    );
    return this.fallbackRequiredDocuments().map((fallback) => {
      const active = activeByType.get(fallback.type);
      if (!active) {
        return fallback;
      }
      return {
        type: active.type,
        version: active.version,
        title: active.title,
        summary: active.summary,
        body: this.documentBodyAsStrings(active.body),
        documentHash: active.documentHash,
      };
    });
  }

  async status(userId: string) {
    if (!userId) {
      throw new BadRequestException('Utente mancante');
    }
    const activeConsents = await this.prisma.consent.findMany({
      where: {
        userId,
        type: { in: REQUIRED_CONSENTS.map((consent) => consent.type) },
        withdrawnAt: null,
      },
      select: {
        type: true,
        version: true,
        documentHash: true,
        grantedAt: true,
      },
    });
    const accepted = new Map(activeConsents.map((item) => [item.type, item]));
    const documents = await this.requiredDocuments();
    const missingConsents = documents
      .filter((document) => {
        const current = accepted.get(document.type);
        return (
          !current ||
          current.version !== document.version ||
          current.documentHash !== document.documentHash
        );
      })
      .map((document) => document.type);

    return {
      required: missingConsents.length > 0,
      missingConsents,
      documents,
      acceptedConsents: activeConsents,
    };
  }

  async hasRequiredConsents(userId: string) {
    const status = await this.status(userId);
    return !status.required;
  }

  async acceptRequired(
    userId: string,
    input: ConsentAcceptanceInput,
    audit: ConsentAuditInput,
  ) {
    await this.assertAcceptedCurrentDocuments(input);
    await this.grantRequired(userId, audit);
    return this.status(userId);
  }

  async grantRequired(userId: string, audit: ConsentAuditInput) {
    const documents = await this.requiredDocuments();
    await this.prisma.$transaction(async (tx) => {
      for (const document of documents) {
        await this.createConsent(tx, userId, document, audit);
      }
    });
  }

  async assertAcceptedCurrentDocuments(input: ConsentAcceptanceInput) {
    if (input.privacyAccepted !== true || input.aiAssistantAccepted !== true) {
      throw new BadRequestException(
        'Privacy e utilizzo dell assistente AI devono essere accettati esplicitamente',
      );
    }
    const documents = await this.requiredDocuments();
    const accepted = new Map(
      (input.acceptedDocuments ?? []).map((document) => [
        document.type,
        document,
      ]),
    );
    for (const document of documents) {
      const current = accepted.get(document.type);
      if (
        current?.version !== document.version ||
        current?.documentHash !== document.documentHash
      ) {
        throw new BadRequestException(
          'Il documento di consenso accettato non corrisponde alla versione corrente',
        );
      }
    }
  }

  async upsertDocument(
    input: {
      type?: string;
      version?: string;
      title?: string;
      summary?: string;
      body?: string[];
      publish?: boolean;
    },
    adminUserId: string,
  ) {
    const type = input.type?.trim();
    const version = input.version?.trim();
    const title = input.title?.trim();
    const summary = input.summary?.trim();
    const body = (input.body ?? []).map((item) => item.trim()).filter(Boolean);
    if (
      !type ||
      !version ||
      !title ||
      !summary ||
      body.length === 0 ||
      !REQUIRED_CONSENTS.some((consent) => consent.type === type)
    ) {
      throw new BadRequestException('Documento consenso non valido');
    }
    const documentHash = consentDocumentHash({
      type,
      version,
      title,
      summary,
      body,
    });
    const publish = input.publish !== false;
    return this.prisma.$transaction(async (tx) => {
      if (publish) {
        await tx.consentDocument.updateMany({
          where: { type },
          data: { isActive: false },
        });
      }
      return tx.consentDocument.upsert({
        where: { type_version: { type, version } },
        update: {
          title,
          summary,
          body,
          documentHash,
          isActive: publish,
          publishedAt: publish ? new Date() : null,
          createdById: adminUserId || null,
        },
        create: {
          type,
          version,
          title,
          summary,
          body,
          documentHash,
          isActive: publish,
          publishedAt: publish ? new Date() : null,
          createdById: adminUserId || null,
        },
      });
    });
  }

  private async createConsent(
    tx: Prisma.TransactionClient,
    userId: string,
    document: Awaited<ReturnType<ConsentsService['requiredDocuments']>>[number],
    audit: ConsentAuditInput,
  ) {
    const existing = await tx.consent.findFirst({
      where: {
        userId,
        type: document.type,
        version: document.version,
        documentHash: document.documentHash,
        withdrawnAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      return;
    }
    await tx.consent.create({
      data: {
        userId,
        type: document.type,
        version: document.version,
        documentTitle: document.title,
        documentHash: document.documentHash,
        documentBody: {
          summary: document.summary,
          body: document.body,
        },
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
        source: audit.source ?? null,
      },
    });
  }

  private async ensureDefaultDocuments() {
    const count = await this.prisma.consentDocument.count({
      where: {
        type: { in: REQUIRED_CONSENTS.map((consent) => consent.type) },
        isActive: true,
      },
    });
    if (count >= REQUIRED_CONSENTS.length) {
      return;
    }
    for (const document of this.fallbackRequiredDocuments()) {
      const existing = await this.prisma.consentDocument.findUnique({
        where: {
          type_version: {
            type: document.type,
            version: document.version,
          },
        },
        select: { id: true },
      });
      if (!existing) {
        await this.prisma.consentDocument.create({
          data: {
            ...document,
            isActive: true,
            publishedAt: new Date(),
          },
        });
      }
    }
  }

  private documentBodyAsStrings(value: Prisma.JsonValue) {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    return [];
  }

  legacyAiConsentType() {
    return 'AI';
  }

  aiAssistantType() {
    return REQUIRED_CONSENT_TYPES.aiAssistant;
  }
}
