import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import {
  LIMITS,
  type GradedAttempt,
  type SolvableAssessment
} from "@proxus/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import {
  abandonAttemptAction,
  activeAttemptQuery,
  disputeAction,
  heartbeatAction,
  solvableAssessmentQuery,
  startAttemptAction,
  submitAttemptAction
} from "../../domain/assessments/atoms.ts";
import {
  AttemptSummary,
  buildAnswers,
  countUnanswered,
  emptyAnswers,
  QuestionCard,
  type LocalAnswers
} from "./question-view.tsx";
import { DEFECT_MESSAGE, messageOf } from "../../lib/error-message.ts";

// El panel de examen a pantalla completa (decisión 18, §6.11). Mientras dura el examen la aplicación
// ES el examen: sin barra lateral, sin pestañas, sin chat (App lo pinta sobre la rejilla). Aquí solo
// viven las preguntas, el reloj y los dos botones que existen (entregar y cancelar). El reloj lo
// pinta el cliente; quien decide si la entrega llegó tarde es el servidor (decisión 9). El tiempo se
// mide contra el latido, no contra el reloj de pared (decisión 19c): el hueco desconectado no cuenta.

type Phase = "briefing" | "running" | "grading" | "graded" | "closed";

interface ExamRunProps {
  readonly artifactId: string;
  readonly title: string;
  // `null` = todavía no hay intento: se enseña el aviso previo y se crea al pulsar (decisión 19f).
  // Con id = se retoma un intento a medias (llega del diálogo de la decisión 19d).
  readonly initialAttemptId: string | null;
  readonly initialRemainingSeconds: number | null;
  readonly onFinished: () => void;
}

const mmss = (total: number): string => {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
};

export function ExamRun(props: ExamRunProps) {
  const solvable = useAtomValue(solvableAssessmentQuery(props.artifactId));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-heading">
      {AsyncResult.matchWithError(solvable, {
        onInitial: () => <Centered>Cargando el examen…</Centered>,
        onError: (error) => (
          <Centered>
            <p className="text-danger-ink">No se pudo cargar el examen: {messageOf(error)}</p>
            <ExitButton onExit={props.onFinished} label="Salir" />
          </Centered>
        ),
        onDefect: () => (
          <Centered>
            <p className="text-danger-ink">No se pudo cargar el examen: {DEFECT_MESSAGE}</p>
            <ExitButton onExit={props.onFinished} label="Salir" />
          </Centered>
        ),
        onSuccess: ({ value }) => <ExamBody assessment={value} {...props} />
      })}
    </div>
  );
}

function ExamBody({
  assessment,
  artifactId,
  title,
  initialAttemptId,
  initialRemainingSeconds,
  onFinished
}: ExamRunProps & { readonly assessment: SolvableAssessment }) {
  const [attemptId, setAttemptId] = useState<string | null>(initialAttemptId);
  const [phase, setPhase] = useState<Phase>(initialAttemptId === null ? "briefing" : "running");
  const [remaining, setRemaining] = useState<number | null>(initialRemainingSeconds);
  const [answers, setAnswers] = useState<LocalAnswers>(emptyAnswers);
  const [graded, setGraded] = useState<GradedAttempt | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const start = useAtomSet(startAttemptAction, { mode: "promise" });
  const submit = useAtomSet(submitAttemptAction, { mode: "promise" });
  const abandon = useAtomSet(abandonAttemptAction, { mode: "promise" });
  const dispute = useAtomSet(disputeAction, { mode: "promise" });
  const heartbeat = useAtomSet(heartbeatAction, { mode: "promise" });
  const refreshActive = useAtomRefresh(activeAttemptQuery);

  // La entrega se dispara una sola vez: el botón y el reloj a cero compiten por ella.
  const submitted = useRef(false);

  const toClosed = useCallback(() => {
    setPhase("closed");
    refreshActive();
  }, [refreshActive]);

  const doSubmit = useCallback(async () => {
    if (attemptId === null || submitted.current) {
      return;
    }
    submitted.current = true;
    setPhase("grading");
    setError(undefined);
    try {
      const result = await submit({
        artifactId,
        attemptId,
        answers: buildAnswers(assessment.questions, answers)
      });
      if (result.status === "graded") {
        setGraded(result);
        setPhase("graded");
      } else {
        setError("El servidor no devolvió el intento corregido.");
        submitted.current = false;
        setPhase("running");
      }
    } catch (cause) {
      const tag = (cause as { readonly _tag?: string } | null)?._tag;
      // El servidor cerró el examen (tiempo agotado) antes de que llegara la entrega: se acabó.
      if (tag === "AttemptAlreadyClosed" || tag === "TimeLimitExceeded") {
        toClosed();
      } else {
        setError(messageOf(cause));
        submitted.current = false;
        setPhase("running");
      }
    }
  }, [attemptId, submit, artifactId, answers, assessment.questions, toClosed]);

  // El reloj: un tic por segundo mientras el examen corre. El servidor lo resincroniza en cada latido.
  useEffect(() => {
    if (phase !== "running") {
      return;
    }
    const id = window.setInterval(() => {
      setRemaining((value) => (value === null ? value : Math.max(0, value - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // Entrega automática al agotarse el tiempo (decisión 20). El margen de `examSubmitGraceSeconds` en
  // el servidor cubre el viaje de esta petición.
  useEffect(() => {
    if (phase === "running" && remaining !== null && remaining <= 0 && !submitted.current) {
      void doSubmit();
    }
  }, [phase, remaining, doSubmit]);

  // El latido (decisión 19c): acumula el tiempo conectado en el servidor y trae el que queda. Uno
  // nada más entrar (cierra el hueco de la interrupción) y luego cada `examHeartbeatIntervalMs`.
  useEffect(() => {
    if (phase !== "running" || attemptId === null) {
      return;
    }
    let cancelled = false;
    const beat = async () => {
      try {
        const response = await heartbeat(attemptId);
        if (cancelled) {
          return;
        }
        if (response.attemptStatus !== "in-progress") {
          toClosed();
        } else {
          setRemaining(response.remainingSeconds);
        }
      } catch (cause) {
        if (cancelled) {
          return;
        }
        // 409 = el intento ya estaba cerrado. Un fallo de red se ignora: el reloj sigue y el hueco
        // lo cuadra el servidor en el siguiente latido que llegue (decisión 19c).
        if ((cause as { readonly _tag?: string } | null)?._tag === "AttemptAlreadyClosed") {
          toClosed();
        }
      }
    };
    void beat();
    const id = window.setInterval(() => void beat(), LIMITS.examHeartbeatIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phase, attemptId, heartbeat, toClosed]);

  // Aviso del navegador al recargar o cerrar la pestaña con el examen abierto (decisión 19e). El
  // texto lo pone el navegador; el que se lee de verdad es el del aviso previo.
  useEffect(() => {
    if (phase !== "running") {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  const onStart = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await start({ artifactId });
      if (result.status === "in-progress") {
        setAttemptId(result.id);
        setRemaining(result.timeLimitSeconds);
        setPhase("running");
      } else {
        setError("El servidor no devolvió un intento en curso.");
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    if (attemptId === null || busy) {
      return;
    }
    if (!window.confirm(
      "¿Cancelar el examen? El intento se guarda como cancelado, no se corrige y no se puede deshacer."
    )) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await abandon({ artifactId, attemptId });
      onFinished();
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  };

  const onDispute = async (questionId: string) => {
    if (attemptId === null) {
      return;
    }
    try {
      const result = await dispute({ attemptId, questionId });
      if (result.status === "graded") {
        setGraded(result);
      }
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  if (phase === "briefing") {
    return (
      <ExamBriefing
        kind={assessment.kind}
        title={title}
        questionCount={assessment.questions.length}
        timeLimitSeconds={assessment.examTimeLimitSeconds}
        busy={busy}
        error={error}
        onStart={() => void onStart()}
        onExit={onFinished}
      />
    );
  }

  if (phase === "closed") {
    return (
      <Centered>
        <div className="max-w-md text-center">
          <h2 className="font-bold text-heading text-xl">Se acabó el tiempo</h2>
          <p className="mt-2 text-muted">
            El examen se cerró al agotarse su tiempo. No se corrige: queda en el historial de la prueba
            como caducado, con sus interrupciones.
          </p>
        </div>
        <ExitButton onExit={onFinished} label="Volver a la aplicación" />
      </Centered>
    );
  }

  const unanswered = countUnanswered(assessment.questions, answers);
  // Se bloquea al entregar, no solo al terminar de corregir: agotado el tiempo la entrega es
  // automática (decisión 20) y desde ese instante no se puede seguir rellenando ni modificar nada,
  // solo esperar la corrección.
  const locked = phase === "grading" || phase === "graded";

  return (
    <>
      <header className="shrink-0 border-border border-b bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-brand text-xs uppercase tracking-widest">
              {assessment.kind === "quiz" ? "Control" : "Examen"} · modo examen
            </p>
            <h2 className="font-bold text-heading text-lg">{title}</h2>
          </div>
          <div className="text-right">
            {phase === "graded"
              ? <p className="font-semibold text-success-ink">Entregado</p>
              : (
                  <p className={`font-bold text-2xl tabular-nums ${
                    remaining !== null && remaining <= 60 ? "text-danger-ink" : "text-heading"
                  }`}>
                    {remaining === null ? "··:··" : mmss(remaining)}
                  </p>
                )}
            <p className="text-muted text-xs">
              {countAnswered(assessment.questions.length, unanswered)} / {assessment.questions.length} respondidas
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto grid max-w-3xl gap-4 pb-8">
          {phase === "graded" && graded !== null && <AttemptSummary attempt={graded} />}
          {assessment.questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              index={index}
              question={question}
              answers={answers}
              setAnswers={setAnswers}
              locked={locked}
              showSource={false}
              correction={graded?.corrections.find((item) => item.questionId === question.id)}
              onDispute={() => void onDispute(question.id)}
            />
          ))}
          {error !== undefined && (
            <p className="rounded-2xl border border-danger/40 bg-danger/15 p-4 text-danger-ink">{error}</p>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-border border-t bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          {phase === "graded"
            ? (
                <>
                  <p className="text-muted text-sm">El examen queda en el historial de la prueba.</p>
                  <ExitButton onExit={onFinished} label="Volver a la aplicación" />
                </>
              )
            : (
                <>
                  <button
                    type="button"
                    onClick={() => void onCancel()}
                    disabled={busy || phase === "grading"}
                    className="rounded-full border border-border-strong px-4 py-2 text-body text-sm hover:border-danger hover:text-danger-ink disabled:opacity-50"
                  >
                    Cancelar el examen
                  </button>
                  <div className="flex items-center gap-3">
                    <p className="text-muted text-sm">
                      {unanswered === 0
                        ? "Todo respondido."
                        : `${unanswered} sin responder (contarán en blanco).`}
                    </p>
                    <button
                      type="button"
                      onClick={() => void doSubmit()}
                      disabled={busy || phase === "grading"}
                      className="rounded-full bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {phase === "grading" ? "Corrigiendo…" : "Entregar"}
                    </button>
                  </div>
                </>
              )}
        </div>
      </footer>
    </>
  );
}

function ExamBriefing({
  kind,
  title,
  questionCount,
  timeLimitSeconds,
  busy,
  error,
  onStart,
  onExit
}: {
  readonly kind: "quiz" | "test";
  readonly title: string;
  readonly questionCount: number;
  readonly timeLimitSeconds: number;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onStart: () => void;
  readonly onExit: () => void;
}) {
  return (
    <Centered>
      <div className="max-w-lg">
        <p className="font-bold text-brand text-xs uppercase tracking-widest">
          {kind === "quiz" ? "Control" : "Examen"} · modo examen
        </p>
        <h2 className="mt-1 font-bold text-heading text-2xl">{title}</h2>
        <p className="mt-3 text-muted">
          {questionCount} {questionCount === 1 ? "pregunta" : "preguntas"} · {Math.round(timeLimitSeconds / 60)} minutos
        </p>
        <ul className="mt-4 grid gap-2 text-body text-sm">
          <li>· La corrección y la nota salen al entregar, no antes. No hay pistas.</li>
          <li>· El reloj solo corre mientras tengas el examen abierto: si te vas, se para y se retoma donde lo dejaste.</li>
          <li>· Cada rato fuera queda registrado como una interrupción y se ve en el historial.</li>
          <li>· Mientras dure, el resto de la aplicación (material, apuntes, tutor) queda cerrado.</li>
        </ul>
        {error !== undefined && (
          <p className="mt-4 rounded-2xl border border-danger/40 bg-danger/15 p-3 text-danger-ink text-sm">{error}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onStart}
            disabled={busy}
            className="rounded-full bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Empezando…" : "Empezar el examen"}
          </button>
          <button
            type="button"
            onClick={onExit}
            disabled={busy}
            className="rounded-full border border-border-strong px-5 py-2 text-body text-sm hover:border-brand disabled:opacity-50"
          >
            Ahora no
          </button>
        </div>
      </div>
    </Centered>
  );
}

function Centered({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      {children}
    </div>
  );
}

function ExitButton({ onExit, label }: { readonly onExit: () => void; readonly label: string }) {
  return (
    <button
      type="button"
      onClick={onExit}
      className="rounded-full border border-border-strong px-5 py-2 text-body text-sm hover:border-brand"
    >
      {label}
    </button>
  );
}

const countAnswered = (total: number, unanswered: number): number => total - unanswered;
