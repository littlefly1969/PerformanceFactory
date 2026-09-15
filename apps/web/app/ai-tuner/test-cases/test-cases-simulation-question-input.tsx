"use client";

import { OnboardingTemplate } from "./test-cases-model";
import type { TestCasesModel } from "./use-test-cases";

export function renderSimulationQuestionInput(
  model: TestCasesModel,
  question: OnboardingTemplate,
) {
  const { simulationAnswers, setSimulationAnswers, normalizeQuestionOptions } =
    model;

  const value = simulationAnswers[question.id] ?? "";
  if (question.inputType === "TEXT") {
    return (
      <textarea
        className="pf-textarea"
        rows={3}
        value={String(value)}
        onChange={(event) =>
          setSimulationAnswers((current) => ({
            ...current,
            [question.id]: event.target.value,
          }))
        }
      />
    );
  }
  if (question.inputType === "NUMBER") {
    return (
      <input
        className="pf-input"
        type="number"
        value={value}
        onChange={(event) =>
          setSimulationAnswers((current) => ({
            ...current,
            [question.id]: event.target.value,
          }))
        }
      />
    );
  }
  const options = normalizeQuestionOptions(question.optionsJson);
  return (
    <select
      className="pf-select"
      value={String(value)}
      onChange={(event) =>
        setSimulationAnswers((current) => ({
          ...current,
          [question.id]: event.target.value,
        }))
      }
    >
      <option value="">Seleziona</option>
      {(options.length
        ? options
        : [
            { value: 1, label: "1" },
            { value: 2, label: "2" },
            { value: 3, label: "3" },
            { value: 4, label: "4" },
            { value: 5, label: "5" },
          ]
      ).map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
