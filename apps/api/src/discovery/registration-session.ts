import { InternalServerErrorException } from '@nestjs/common';
import { Session } from 'express-session';
import { markAthleteSession } from '../auth/athlete-session';

export type RegistrationRequest = {
  session?: Session;
  raw?: { session?: Session };
};

export async function registrationSession(
  req: RegistrationRequest,
  userId: string,
) {
  const session = req.session ?? req.raw?.session;
  if (!session)
    throw new InternalServerErrorException('Sessione non disponibile');
  await new Promise<void>((resolve, reject) =>
    session.regenerate((error) =>
      error
        ? reject(
            error instanceof Error
              ? error
              : new Error('Salvataggio sessione fallito'),
          )
        : resolve(),
    ),
  );
  const fresh = req.raw?.session ?? req.session;
  if (!fresh)
    throw new InternalServerErrorException('Sessione non disponibile');
  (fresh as Session & { userId: string }).userId = userId;
  // La registrazione crea sempre un atleta: sessione lunga per l'app installata.
  markAthleteSession(fresh);
  if (req.session) req.session = fresh;
  await new Promise<void>((resolve, reject) =>
    fresh.save((error) =>
      error
        ? reject(
            error instanceof Error
              ? error
              : new Error('Salvataggio sessione fallito'),
          )
        : resolve(),
    ),
  );
}
