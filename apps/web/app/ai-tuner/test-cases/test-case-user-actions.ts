import type { Dispatch, SetStateAction } from "react";
import {
  AnamnesisTestUser,
  SimulationChatMessage,
  SimulationPhaseId,
  TestResult,
  TestRunSnapshot,
  anamnesisTestUsersStorageKey,
} from "./test-cases-model";
export function persistAnamnesisTestUsersAction(
  actionState: {
    setAnamnesisTestUsers: Dispatch<SetStateAction<AnamnesisTestUser[]>>;
  },
  items: AnamnesisTestUser[],
) {
  const { setAnamnesisTestUsers } = actionState;

  setAnamnesisTestUsers(items);
  window.localStorage.setItem(
    anamnesisTestUsersStorageKey,
    JSON.stringify(items),
  );
}

export function applySavedAnamnesisUserAction(
  actionState: {
    setSelectedAnamnesisUserId: Dispatch<SetStateAction<string>>;
    setAnamnesisUserLabel: Dispatch<SetStateAction<string>>;
    setSimulationAnswers: Dispatch<
      SetStateAction<Record<string, string | number>>
    >;
    anamnesisTestUsers: AnamnesisTestUser[];
    setUsersEditorOpen: Dispatch<SetStateAction<boolean>>;
  },
  userId: string,
) {
  const {
    setSelectedAnamnesisUserId,
    setAnamnesisUserLabel,
    setSimulationAnswers,
    anamnesisTestUsers,
    setUsersEditorOpen,
  } = actionState;

  setSelectedAnamnesisUserId(userId);
  if (!userId) {
    setAnamnesisUserLabel("");
    setSimulationAnswers({});
    return;
  }
  const user = anamnesisTestUsers.find((item) => item.id === userId);
  if (!user) return;
  setAnamnesisUserLabel(user.label);
  setSimulationAnswers(user.answers);
  setUsersEditorOpen(true);
}

export function startNewAnamnesisTestUserAction(actionState: {
  setSelectedAnamnesisUserId: Dispatch<SetStateAction<string>>;
  setAnamnesisUserLabel: Dispatch<SetStateAction<string>>;
  setSimulationAnswers: Dispatch<
    SetStateAction<Record<string, string | number>>
  >;
  setUsersEditorOpen: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const {
    setSelectedAnamnesisUserId,
    setAnamnesisUserLabel,
    setSimulationAnswers,
    setUsersEditorOpen,
    setMessage,
  } = actionState;

  setSelectedAnamnesisUserId("");
  setAnamnesisUserLabel("");
  setSimulationAnswers({});
  setUsersEditorOpen(true);
  setMessage(null);
}

export function saveAnamnesisTestUserAction(actionState: {
  anamnesisUserLabel: string;
  setMessage: Dispatch<SetStateAction<string | null>>;
  selectedAnamnesisUserId: string;
  simulationAnswers: Record<string, string | number>;
  anamnesisTestUsers: AnamnesisTestUser[];
  persistAnamnesisTestUsers: (items: AnamnesisTestUser[]) => void;
  setSelectedAnamnesisUserId: Dispatch<SetStateAction<string>>;
  setUsersEditorOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    anamnesisUserLabel,
    setMessage,
    selectedAnamnesisUserId,
    simulationAnswers,
    anamnesisTestUsers,
    persistAnamnesisTestUsers,
    setSelectedAnamnesisUserId,
    setUsersEditorOpen,
  } = actionState;

  const label = anamnesisUserLabel.trim();
  if (!label) {
    setMessage("Inserisci un nome per salvare l'utente anamnestico.");
    return;
  }
  const now = new Date().toISOString();
  const id =
    selectedAnamnesisUserId ||
    `anamnesis-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const nextUser: AnamnesisTestUser = {
    id,
    label,
    answers: simulationAnswers,
    createdAt:
      anamnesisTestUsers.find((item) => item.id === id)?.createdAt ?? now,
    updatedAt: now,
  };
  const next = [
    nextUser,
    ...anamnesisTestUsers.filter((item) => item.id !== id),
  ].slice(0, 50);
  persistAnamnesisTestUsers(next);
  setSelectedAnamnesisUserId(id);
  setUsersEditorOpen(false);
  setMessage("Utente anamnestico salvato.");
}

export function deleteAnamnesisTestUserAction(actionState: {
  selectedAnamnesisUserId: string;
  anamnesisTestUsers: AnamnesisTestUser[];
  persistAnamnesisTestUsers: (items: AnamnesisTestUser[]) => void;
  setSelectedAnamnesisUserId: Dispatch<SetStateAction<string>>;
  setAnamnesisUserLabel: Dispatch<SetStateAction<string>>;
  setSimulationAnswers: Dispatch<
    SetStateAction<Record<string, string | number>>
  >;
  setUsersEditorOpen: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const {
    selectedAnamnesisUserId,
    anamnesisTestUsers,
    persistAnamnesisTestUsers,
    setSelectedAnamnesisUserId,
    setAnamnesisUserLabel,
    setSimulationAnswers,
    setUsersEditorOpen,
    setMessage,
  } = actionState;

  if (!selectedAnamnesisUserId) return;
  const next = anamnesisTestUsers.filter(
    (item) => item.id !== selectedAnamnesisUserId,
  );
  persistAnamnesisTestUsers(next);
  setSelectedAnamnesisUserId("");
  setAnamnesisUserLabel("");
  setSimulationAnswers({});
  setUsersEditorOpen(false);
  setMessage("Utente anamnestico rimosso.");
}

export function openNewSimulationAction(actionState: {
  setSimulationPhase: Dispatch<SetStateAction<SimulationPhaseId>>;
  setSelectedAnamnesisUserId: Dispatch<SetStateAction<string>>;
  setAnamnesisUserLabel: Dispatch<SetStateAction<string>>;
  setSimulationAnswers: Dispatch<
    SetStateAction<Record<string, string | number>>
  >;
  setSimulationGoal: Dispatch<SetStateAction<string>>;
  setSimulationAiQuestionsResult: Dispatch<SetStateAction<TestResult | null>>;
  setSimulationSpecialistScores: Dispatch<
    SetStateAction<Record<string, number>>
  >;
  setSimulationTestResult: Dispatch<SetStateAction<TestResult | null>>;
  setSimulationTestSnapshot: Dispatch<SetStateAction<TestRunSnapshot | null>>;
  setSimulationDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSimulationChatMessages: Dispatch<SetStateAction<SimulationChatMessage[]>>;
  setSimulationChatInput: Dispatch<SetStateAction<string>>;
  setRefiningSimulationDialog: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setSimulationOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    setSimulationPhase,
    setSelectedAnamnesisUserId,
    setAnamnesisUserLabel,
    setSimulationAnswers,
    setSimulationGoal,
    setSimulationAiQuestionsResult,
    setSimulationSpecialistScores,
    setSimulationTestResult,
    setSimulationTestSnapshot,
    setSimulationDialogOpen,
    setSimulationChatMessages,
    setSimulationChatInput,
    setRefiningSimulationDialog,
    setMessage,
    setSimulationOpen,
  } = actionState;

  setSimulationPhase("prompt-choice");
  setSelectedAnamnesisUserId("");
  setAnamnesisUserLabel("");
  setSimulationAnswers({});
  setSimulationGoal("");
  setSimulationAiQuestionsResult(null);
  setSimulationSpecialistScores({});
  setSimulationTestResult(null);
  setSimulationTestSnapshot(null);
  setSimulationDialogOpen(false);
  setSimulationChatMessages([]);
  setSimulationChatInput("");
  setRefiningSimulationDialog(false);
  setMessage(null);
  setSimulationOpen(true);
}
