import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PROFILE_PHOTO_MAX_LENGTH,
  ProfilePhotoDto,
  ProfilePhotoService,
} from './profile-photo';
import type { PrismaService } from '../prisma/prisma.service';

const problems = async (image: unknown) =>
  (await validate(plainToInstance(ProfilePhotoDto, { image }))).length;

describe('ProfilePhotoDto', () => {
  it('accepts a base64 image data URL', async () => {
    expect(await problems('data:image/jpeg;base64,/9j/4AAQ+a==')).toBe(0);
  });

  it('rejects other formats, scripts and oversized photos', async () => {
    expect(await problems('data:image/svg+xml;base64,PHN2Zz4=')).toBe(1);
    expect(await problems('https://example.com/me.jpg')).toBe(1);
    expect(await problems(42)).toBe(1);
    expect(
      await problems(
        `data:image/jpeg;base64,${'A'.repeat(PROFILE_PHOTO_MAX_LENGTH)}`,
      ),
    ).toBe(1);
  });
});

describe('ProfilePhotoService', () => {
  it('saves and removes the photo on the user', async () => {
    const update = jest.fn();
    const service = new ProfilePhotoService({
      user: { update },
    } as unknown as PrismaService);
    expect(await service.save('u1', 'data:image/png;base64,AA==')).toEqual({
      image: 'data:image/png;base64,AA==',
    });
    await service.save('u1', null);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'u1' },
      data: { avatarImage: null },
    });
  });
});
