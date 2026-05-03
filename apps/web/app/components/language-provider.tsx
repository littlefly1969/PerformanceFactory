"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Language = "it" | "en";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (value: string) => string;
};

const dictionary: Record<string, string> = {};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const translatedValues = new Set(Object.values(dictionary));

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const translate = (language: Language, value: string) => {
  if (language === "en") {
    return value;
  }
  if (translatedValues.has(value)) {
    return value;
  }
  const exact = dictionary[value];
  if (exact) {
    return exact;
  }
  return Object.entries(dictionary)
    .sort((a, b) => b[0].length - a[0].length)
    .reduce((next, [source, target]) => {
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}_])${escapeRegExp(source)}(?![\\p{L}\\p{N}_])`,
        "gu",
      );
      return next.replace(pattern, target);
    }, value);
};

function translateElement(root: ParentNode, language: Language) {
  if (language === "en") {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    const raw = node.nodeValue ?? "";
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const next = translate(language, trimmed);
    if (next !== trimmed) {
      node.nodeValue = raw.replace(trimmed, next);
    }
  }

  const elements = root.querySelectorAll?.(
    "[placeholder], [title], [aria-label]",
  );
  elements?.forEach((element) => {
    for (const attr of ["placeholder", "title", "aria-label"]) {
      const current = element.getAttribute(attr);
      if (current) {
        element.setAttribute(attr, translate(language, current));
      }
    }
  });
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("it");

  useEffect(() => {
    window.localStorage.setItem("pf.language", "it");
    setLanguageState("it");
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    translateElement(document.body, language);
    const observer = new MutationObserver(() =>
      translateElement(document.body, language),
    );
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: (next) => {
        window.localStorage.setItem("pf.language", "it");
        void next;
        window.location.reload();
      },
      t: (text) => translate(language, text),
    }),
    [language],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

export function LanguageToggle() {
  const { language } = useLanguage();
  return (
    <span className="pf-lang-toggle" aria-label="Lingua italiana">
      <span className={language === "it" ? "active" : ""}>IT</span>
    </span>
  );
}
