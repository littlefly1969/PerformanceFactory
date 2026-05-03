import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ProfessionalService } from '../professional/professional.service';

type Actor = {
  id: string;
  role: UserRole;
};

@Injectable()
export class CyclesService {
  constructor(private readonly professional: ProfessionalService) {}

  async getStatus(actor: Actor, cycleId: string) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException('Operazione non consentita');
    }

    return this.professional.getCycleStatus(actor, cycleId);
  }
}
