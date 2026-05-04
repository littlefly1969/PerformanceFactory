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
};

@Injectable()
export class ConsentsService {
  constructor(private readonly prisma: PrismaService) {}

  requiredDocuments() {
    return REQUIRED_CONSENTS.map((consent) => ({
      type: consent.type,
      version: consent.version,
      title: consent.title,
      summary: consent.summary,
      body: [...consent.body],
      documentHash: consentDocumentHash(consent),
    }));
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
    const documents = this.requiredDocuments();
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
    input: { privacyAccepted?: boolean; aiAssistantAccepted?: boolean },
    audit: ConsentAuditInput,
  ) {
    if (input.privacyAccepted !== true || input.aiAssistantAccepted !== true) {
      throw new BadRequestException(
        'Privacy e utilizzo dell assistente AI devono essere accettati esplicitamente',
      );
    }
    await this.grantRequired(userId, audit);
    return this.status(userId);
  }

  async grantRequired(userId: string, audit: ConsentAuditInput) {
    const documents = this.requiredDocuments();
    await this.prisma.$transaction(async (tx) => {
      for (const document of documents) {
        await this.createConsent(tx, userId, document, audit);
      }
    });
  }

  private async createConsent(
    tx: Prisma.TransactionClient,
    userId: string,
    document: ReturnType<ConsentsService['requiredDocuments']>[number],
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
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
      },
    });
  }

  legacyAiConsentType() {
    return 'AI';
  }

  aiAssistantType() {
    return REQUIRED_CONSENT_TYPES.aiAssistant;
  }
}
