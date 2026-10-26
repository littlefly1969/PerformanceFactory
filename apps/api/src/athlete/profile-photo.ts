import { Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

/** Il client ridimensiona a 320px: 200k caratteri bastano con ampio margine. */
export const PROFILE_PHOTO_MAX_LENGTH = 200_000;

export class ProfilePhotoDto {
  @ApiProperty({ example: 'data:image/jpeg;base64,/9j/4AAQ...' })
  @IsString()
  @MaxLength(PROFILE_PHOTO_MAX_LENGTH, {
    message: 'La foto è troppo grande. Scegline una più leggera.',
  })
  @Matches(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, {
    message: 'Formato della foto non supportato',
  })
  image!: string;
}

/** Foto profilo facoltativa dell'atleta: il coach lo riconosce in campo. */
@Injectable()
export class ProfilePhotoService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarImage: true },
    });
    return { image: user.avatarImage };
  }

  async save(userId: string, image: string | null) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarImage: image },
    });
    return { image };
  }
}
