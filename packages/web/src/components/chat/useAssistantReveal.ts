import { useEffect, useRef, useState } from "react";
import { codePointLength, revealSchedule, sliceCodePoints } from "../../domain/tutor/assistant-reveal.ts";

// Plan de correcciones §4.2.6 / C5-10: revela un texto YA COMPLETO de forma progresiva durante como
// mucho 1,5 segundos. No es streaming de tokens (decisión 14): el servidor manda el mensaje entero y
// esto solo elige el prefijo visible. La fuente de Streamdown sigue siendo el texto completo; el hook
// no modifica ni persiste el mensaje.
//
// Si el usuario prefiere movimiento reducido, o el turno no es el vivo (`animate === false`, p. ej. un
// turno hidratado del historial), devuelve el texto entero de inmediato.

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface AssistantReveal {
  readonly visibleText: string;
  readonly animating: boolean;
  // Ha llegado a revelar algo por temporizador en algún momento de la vida de este componente. Sirve
  // para anunciar la respuesta una sola vez a un lector de pantalla, sin leer cada fragmento.
  readonly didAnimate: boolean;
}

const FULLY_REVEALED = Number.MAX_SAFE_INTEGER;

export function useAssistantReveal(text: string | null, animate: boolean): AssistantReveal {
  const reducedRef = useRef<boolean | null>(null);
  if (reducedRef.current === null) {
    reducedRef.current = prefersReducedMotion();
  }
  const shouldAnimate = animate && !reducedRef.current && text !== null;

  const [count, setCount] = useState<number>(FULLY_REVEALED);
  const startedRef = useRef(false);
  const didAnimateRef = useRef(false);

  useEffect(() => {
    if (!shouldAnimate || text === null || startedRef.current) {
      return;
    }
    startedRef.current = true;
    const schedule = revealSchedule(codePointLength(text));
    if (schedule.codePointsPerTick === 0) {
      return;
    }
    didAnimateRef.current = true;
    setCount(schedule.codePointsPerTick);
    const timer = window.setInterval(() => {
      setCount((current) => {
        const next = current + schedule.codePointsPerTick;
        if (next >= schedule.totalCodePoints) {
          window.clearInterval(timer);
          return FULLY_REVEALED;
        }
        return next;
      });
    }, schedule.tickMs);
    return () => window.clearInterval(timer);
  }, [shouldAnimate, text]);

  if (text === null) {
    return { visibleText: "", animating: false, didAnimate: didAnimateRef.current };
  }
  if (!shouldAnimate) {
    return { visibleText: text, animating: false, didAnimate: didAnimateRef.current };
  }
  const total = codePointLength(text);
  const revealed = count >= total;
  return {
    visibleText: revealed ? text : sliceCodePoints(text, count),
    animating: !revealed,
    didAnimate: didAnimateRef.current
  };
}
