"use client";
import { useEffect, useState } from "react";

/** Conto alla rovescia al secondo; vibra a zero dove il telefono lo consente. */
export function useCountdown(seconds: number, autoStart = false) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(autoStart && seconds > 0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setRemaining((value) => {
        if (value > 1) return value - 1;
        setRunning(false);
        try {
          navigator.vibrate?.(200);
        } catch {
          // Vibrazione non disponibile.
        }
        return 0;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);
  return {
    remaining,
    running,
    start: () => {
      setRemaining((value) => (value === 0 ? seconds : value));
      setRunning(seconds > 0);
    },
    pause: () => setRunning(false),
  };
}
