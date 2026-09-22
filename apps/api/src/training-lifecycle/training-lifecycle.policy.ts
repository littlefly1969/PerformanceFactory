import { Injectable, ConflictException } from '@nestjs/common';

@Injectable()
export class TrainingLifecyclePolicy {
  get enabled() {
    return process.env.TRAINING_LIFECYCLE_AUTOMATION !== 'false';
  }
  get autoAssign() {
    return process.env.COACH_AUTO_ASSIGNMENT !== 'false';
  }
  get autoContinue() {
    return process.env.NEXT_CYCLE_AUTO_GENERATION !== 'false';
  }
  get approvalMode(): 'AUTO' | 'MANUAL' {
    const value = process.env.TRAINING_APPROVAL_MODE ?? 'AUTO';
    if (value !== 'AUTO' && value !== 'MANUAL')
      throw new Error('TRAINING_APPROVAL_MODE must be AUTO or MANUAL');
    if (
      (process.env.TRAINING_SESSION_APPROVAL_MODE ?? 'INHERIT_PLAN') !==
      'INHERIT_PLAN'
    )
      throw new Error(
        'Only INHERIT_PLAN session approval is currently supported',
      );
    return value;
  }
}
export class LifecycleError extends ConflictException {
  constructor(public readonly code: string) {
    super({ code, message: code });
  }
}
