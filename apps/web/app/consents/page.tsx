"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductShell, StatusBadge } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type ConsentDocument = {
  type: "PRIVACY" | "AI_ASSISTANT" | string;
  version: string;
  title: string;
  summary: string;
  body: string[];
  documentHash: string;
};

type ConsentStatus = {
  required: boolean;
  missingConsents: string[];
  documents: ConsentDocument[];
};

type CurrentUser = {
  role?: string;
  onboardingRequired?: boolean;
};

const roleHome: Record<string, string> = {
  USER: "/user",
  PROFESSIONAL: "/professional",
  ADMIN: "/admin/cycles",
};

const redirectAfterConsent = (current: CurrentUser | null) => {
  if (current?.role === "USER" && current.onboardingRequired) {
    window.location.href = "/onboarding";
    return;
  }
  window.location.href = roleHome[current?.role ?? ""] ?? "/";
};

export default function ConsentsPage() {
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [aiAssistantAccepted, setAiAssistantAccepted] = useState(false);
  const [message, setMessa
