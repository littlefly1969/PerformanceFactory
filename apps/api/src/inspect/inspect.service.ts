import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import {
  assignCoachCompetences,
  assignCompetences,
  linkUserToCoach,
  linkUserToProfessional,
} from './inspect-assignments';
import { getCycle, listCycles } from './inspect-cycles';
import { getProfessional, listProfessionals } from './inspect-professionals';
import { createUser, getUser, listUsers } from './inspect-users';

@Injectable()
export class InspectService {
  constructor(private readonly prisma: PrismaService) {}
  async listCycles() {
    return listCycles(this.prisma);
  }

  async getCycle(cycleId: string) {
    return getCycle(this.prisma, cycleId);
  }

  async listUsers() {
    return listUsers(this.prisma);
  }

  async createUser(email: string, password: string, role: UserRole) {
    return createUser(this.prisma, email, password, role);
  }

  async getUser(userId: string) {
    return getUser(this.prisma, userId);
  }

  async listProfessionals() {
    return listProfessionals(this.prisma);
  }

  async linkUserToProfessional(
    professionalId: string,
    userId: string,
    areaId: string,
  ) {
    return linkUserToProfessional(this.prisma, professionalId, userId, areaId);
  }

  async assignCompetences(professionalId: string, areaIds: string[]) {
    return assignCompetences(this.prisma, professionalId, areaIds);
  }

  async linkUserToCoach(
    coachId: string,
    userId: string,
    specializationId: string,
  ) {
    return linkUserToCoach(this.prisma, coachId, userId, specializationId);
  }

  async assignCoachCompetences(coachId: string, specializationIds: string[]) {
    return assignCoachCompetences(this.prisma, coachId, specializationIds);
  }

  async getProfessional(professionalId: string) {
    return getProfessional(this.prisma, professionalId);
  }
}
