import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export const VIDEO_LIMITS = { title: 120, description: 400, url: 500 };

/** Video più recenti passati all'AI per un driver: il catalogo resta piccolo. */
const CATALOG_SIZE = 30;

/** Video che l'AI può proporre su un driver: quelli del driver e quelli generali. */
export function videoCatalog(db: Db, areaId: string) {
  return db.coachingVideo.findMany({
    where: { isActive: true, OR: [{ areaId }, { areaId: null }] },
    orderBy: { updatedAt: 'desc' },
    take: CATALOG_SIZE,
    select: { id: true, title: true, description: true },
  });
}

/**
 * Video scelto dall'AI per l'atleta: il titolo viene dall'archivio se il
 * video esiste ancora, altrimenti resta quello suggerito; l'indirizzo c'è solo
 * quando il file è pronto. Senza video l'atleta vede il titolo nel riquadro.
 */
export async function resolveVideo(
  db: Db,
  choice: { videoId: string | null; title: string } | undefined,
) {
  if (!choice) return null;
  const video = choice.videoId
    ? await db.coachingVideo.findFirst({
        where: { id: choice.videoId, isActive: true },
        select: { title: true, url: true },
      })
    : null;
  return {
    title: video?.title ?? choice.title,
    url: video?.url ?? null,
  };
}

/** Back office: archivio dei video di approfondimento. */
@Injectable()
export class CoachingVideosService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.coachingVideo.findMany({
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      include: { area: { select: { id: true, name: true } } },
    });
  }

  create(input: {
    title: string;
    description?: string;
    url?: string | null;
    areaId?: string | null;
  }) {
    return this.prisma.coachingVideo.create({
      data: {
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        url: input.url?.trim() || null,
        areaId: input.areaId ?? null,
      },
      include: { area: { select: { id: true, name: true } } },
    });
  }

  async update(
    id: string,
    input: {
      title?: string;
      description?: string;
      url?: string | null;
      areaId?: string | null;
      isActive?: boolean;
    },
  ) {
    if (!(await this.prisma.coachingVideo.count({ where: { id } })))
      throw new NotFoundException('Video non trovato');
    return this.prisma.coachingVideo.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() }
          : {}),
        ...(input.url !== undefined ? { url: input.url?.trim() || null } : {}),
        ...(input.areaId !== undefined ? { areaId: input.areaId } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { area: { select: { id: true, name: true } } },
    });
  }
}
