-- Normalize the fixed six performance areas.
-- Older local data used English labels; a later seed inserted Italian labels as
-- new rows. Keep the original row ids, merge any duplicate Italian rows into
-- them, then expose the canonical Italian labels.

DO $$
DECLARE
  mapping RECORD;
  target_id TEXT;
  source_id TEXT;
BEGIN
  FOR mapping IN
    SELECT *
    FROM (VALUES
      ('Technical-Tactical', 'Tecnico-tattica'),
      ('Athletic Preparation', 'Preparazione atletica'),
      ('Equipment', 'Equipaggiamento'),
      ('Physiotherapy', 'Fisioterapia'),
      ('Nutrition', 'Nutrizione'),
      ('Mental Training', 'Allenamento mentale')
    ) AS area_map(old_name, new_name)
  LOOP
    SELECT id INTO target_id FROM "Area" WHERE name = mapping.old_name;
    SELECT id INTO source_id FROM "Area" WHERE name = mapping.new_name;

    IF target_id IS NOT NULL AND source_id IS NOT NULL AND target_id <> source_id THEN
      DELETE FROM "ProfessionalAreaCompetence" dup
      USING "ProfessionalAreaCompetence" keep
      WHERE dup."areaId" = source_id
        AND keep."areaId" = target_id
        AND dup."professionalId" = keep."professionalId";
      UPDATE "ProfessionalAreaCompetence" SET "areaId" = target_id WHERE "areaId" = source_id;

      DELETE FROM "ProfessionalUserLink" dup
      USING "ProfessionalUserLink" keep
      WHERE dup."areaId" = source_id
        AND keep."areaId" = target_id
        AND dup."userId" = keep."userId";
      UPDATE "ProfessionalUserLink" SET "areaId" = target_id WHERE "areaId" = source_id;

      DELETE FROM "SportSpecializationAreaPrompt" dup
      USING "SportSpecializationAreaPrompt" keep
      WHERE dup."areaId" = source_id
        AND keep."areaId" = target_id
        AND dup."specializationId" = keep."specializationId";
      UPDATE "SportSpecializationAreaPrompt" SET "areaId" = target_id WHERE "areaId" = source_id;

      DELETE FROM "UserAreaPromptInstruction" dup
      USING "UserAreaPromptInstruction" keep
      WHERE dup."areaId" = source_id
        AND keep."areaId" = target_id
        AND dup."userId" = keep."userId";
      UPDATE "UserAreaPromptInstruction" SET "areaId" = target_id WHERE "areaId" = source_id;

      DELETE FROM "UserOnboardingQuestion" dup
      USING "UserOnboardingQuestion" keep
      WHERE dup."areaId" = source_id
        AND keep."areaId" = target_id
        AND dup."userId" = keep."userId"
        AND dup."orderIndex" = keep."orderIndex";
      UPDATE "UserOnboardingQuestion" SET "areaId" = target_id WHERE "areaId" = source_id;

      DELETE FROM "CurrentState" dup
      USING "CurrentState" keep
      WHERE dup."areaId" = source_id
        AND keep."areaId" = target_id
        AND dup."userId" = keep."userId";
      UPDATE "CurrentState" SET "areaId" = target_id WHERE "areaId" = source_id;

      DELETE FROM "PerformanceProfileSnapshotArea" dup
      USING "PerformanceProfileSnapshotArea" keep
      WHERE dup."areaId" = source_id
        AND keep."areaId" = target_id
        AND dup."snapshotId" = keep."snapshotId";
      UPDATE "PerformanceProfileSnapshotArea" SET "areaId" = target_id WHERE "areaId" = source_id;

      DELETE FROM "ImprovementPlanRelease" dup
      USING "ImprovementPlanRelease" keep
      WHERE dup."areaId" = source_id
        AND keep."areaId" = target_id
        AND dup."userId" = keep."userId"
        AND dup."version" = keep."version";
      UPDATE "ImprovementPlanRelease" SET "areaId" = target_id WHERE "areaId" = source_id;

      DELETE FROM "QuestionSetAreaApproval" dup
      USING "QuestionSetAreaApproval" keep
      WHERE dup."areaId" = source_id
        AND keep."areaId" = target_id
        AND dup."questionSetId" = keep."questionSetId";
      UPDATE "QuestionSetAreaApproval" SET "areaId" = target_id WHERE "areaId" = source_id;

      DELETE FROM "AiAreaGenerationConfig" WHERE "areaId" = source_id;
      DELETE FROM "OnboardingQuestionTemplate" WHERE "areaId" = source_id;

      UPDATE "FeedbackEntry" SET "areaId" = target_id WHERE "areaId" = source_id;
      UPDATE "GuidanceContent" SET "areaId" = target_id WHERE "areaId" = source_id;
      UPDATE "KpiDaily" SET "areaId" = target_id WHERE "areaId" = source_id;
      UPDATE "PlanItem" SET "areaId" = target_id WHERE "areaId" = source_id;
      UPDATE "QuestionSet" SET "areaId" = target_id WHERE "areaId" = source_id;
      UPDATE "Question" SET "areaId" = target_id WHERE "areaId" = source_id;

      DELETE FROM "Area" WHERE id = source_id;
    END IF;

    IF target_id IS NOT NULL THEN
      UPDATE "Area" SET name = mapping.new_name WHERE id = target_id;
    END IF;
  END LOOP;
END $$;
