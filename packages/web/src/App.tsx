import { useEffect, useRef, useState } from "react";
import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { ActiveAttemptResponse, ChatContextRef } from "@proxus/shared";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { Chat } from "./components/Chat.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { MaterialPanel } from "./components/MaterialPanel.tsx";
import type { Tab } from "./components/material/MaterialTabs.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { AppShell } from "./components/shell/AppShell.tsx";
import { SystemNoticeRegion } from "./components/shell/SystemNoticeRegion.tsx";
import { ExamRun } from "./components/assessment/ExamRun.tsx";
import { ResumeExamDialog } from "./components/assessment/ResumeExamDialog.tsx";
import { activeAttemptQuery } from "./domain/assessments/atoms.ts";
import { materialsQuery } from "./domain/materials/atoms.ts";

// El Examen real que el alumno ya ha "entrado": el panel se pinta hasta que él sale (con la entrega o
// cancelándolo), no según lo que diga el servidor en cada momento. `attemptId: null` = se va a
// empezar uno nuevo y toca el aviso previo (decisión 19f).
interface EnteredExam {
  readonly artifactId: string;
  readonly title: string;
  readonly attemptId: string | null;
  readonly remainingSeconds: number | null;
}

const NO_ACTIVE_EXAM: ActiveAttemptResponse = {
  attemptId: null,
  artifactId: null,
  artifactKind: null,
  title: null,
  remainingSeconds: null
};

// Dónde tiene que aterrizar una cita (fase 5, decisión 26): material, página, consumida una vez.
interface CitationTarget {
  readonly materialId: string;
  readonly page: number;
}

// Dónde aterriza un material recién preparado (§11.4, F5-48): mismo patrón que la cita, con la
// pestaña como destino. `MaterialPanel` lo consume una sola vez cuando el material coincide.
interface LandingTarget {
  readonly materialId: string;
  readonly tab: Tab;
}

export function App() {
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [enteredExam, setEnteredExam] = useState<EnteredExam | null>(null);
  // Contexto de pantalla (fase 4, decisión 5): lo reporta `MaterialPanel` (material más artefacto de
  // su pestaña activa); vacío cuando no hay panel de material abierto.
  const [screenContext, setScreenContext] = useState<readonly ChatContextRef[]>([]);
  // Una cita común (apunte, corrección) siempre abre el material correcto, cambia a PDF y navega a
  // la primera página (decisión 26, §4.10). "Material distinto cambia selección antes de abrir PDF":
  // se cambia el material seleccionado y `MaterialPanel` consume el objetivo cuando coincide con el
  // suyo, tanto si ya estaba abierto como si acaba de montarse por el cambio.
  const [citationTarget, setCitationTarget] = useState<CitationTarget | null>(null);
  const openCitation = (materialId: string, page: number) => {
    setSelectedMaterialId(materialId);
    setCitationTarget({ materialId, page });
  };

  const [landingTarget, setLandingTarget] = useState<LandingTarget | null>(null);
  // La cadena de preparación termina fuera del ciclo de render, así que la condición "no hay ningún
  // material abierto" se lee de un ref al día, no del valor capturado cuando empezó la subida.
  const openMaterialRef = useRef<string | null>(null);
  useEffect(() => {
    openMaterialRef.current = selectedMaterialId;
  }, [selectedMaterialId]);

  // Un único PDF recién preparado y ninguna pantalla que robar: se abre en Mapa, que es donde se ve
  // de un vistazo lo que se acaba de construir (§11.4, decisión 33, F5-48). Si el alumno ya está
  // mirando otro material, no se navega.
  const onMaterialPrepared = (materialId: string) => {
    if (openMaterialRef.current !== null) {
      return;
    }
    openMaterialRef.current = materialId;
    setSelectedMaterialId(materialId);
    setLandingTarget({ materialId, tab: "mindmap" });
  };
  const materials = useAtomValue(materialsQuery);
  const refreshActiveExam = useAtomRefresh(activeAttemptQuery);
  const activeExam = AsyncResult.getOrElse(useAtomValue(activeAttemptQuery), () => NO_ACTIVE_EXAM);

  // Mientras haya un Examen real en curso la aplicación ES el examen (decisión 18): sin barra
  // lateral, sin panel del material, sin chat. La barrera de verdad está en el servidor (rutas 409);
  // esto es solo que no tiene sentido enseñar lo que no se puede tocar.
  if (enteredExam !== null) {
    return (
      <ErrorBoundary label="el examen">
        <ExamRun
          key={enteredExam.attemptId ?? enteredExam.artifactId}
          artifactId={enteredExam.artifactId}
          title={enteredExam.title}
          initialAttemptId={enteredExam.attemptId}
          initialRemainingSeconds={enteredExam.remainingSeconds}
          onFinished={() => {
            setEnteredExam(null);
            refreshActiveExam();
          }}
        />
      </ErrorBoundary>
    );
  }

  // Al arrancar (o tras una recarga) el servidor dice si hay un Examen real a medias: el diálogo de
  // la decisión 19d es lo primero que se ve y la llave de la puerta cerrada.
  if (activeExam.attemptId !== null && activeExam.artifactId !== null) {
    const { artifactId, attemptId, title, remainingSeconds } = activeExam;
    return (
      <ErrorBoundary label="el examen a medias">
        <ResumeExamDialog
          artifactId={artifactId}
          attemptId={attemptId}
          title={title}
          remainingSeconds={remainingSeconds}
          onResume={() => setEnteredExam({
            artifactId,
            title: title ?? "el examen",
            attemptId,
            remainingSeconds
          })}
        />
      </ErrorBoundary>
    );
  }

  const selectedMaterial = selectedMaterialId === null
    ? undefined
    : AsyncResult.getOrElse(materials, () => ({ materials: [] as const }))
      .materials.find((material) => material.id === selectedMaterialId);

  const hasMiddlePanel = selectedMaterial !== undefined;

  return (
    <>
      <SystemNoticeRegion />
      <AppShell
        sidebar={({ collapsed, onToggleCollapsed }) => (
          // Un panel que se caiga no se lleva a los otros dos por delante: cada uno tiene su red.
          <ErrorBoundary label="la lista de materiales">
            <Sidebar
              selectedMaterialId={selectedMaterialId}
              onSelectMaterial={setSelectedMaterialId}
              collapsed={collapsed}
              onToggleCollapsed={onToggleCollapsed}
              onMaterialPrepared={onMaterialPrepared}
            />
          </ErrorBoundary>
        )}
        material={selectedMaterial === undefined ? null : (
          <ErrorBoundary key={selectedMaterial.id} label="el panel del material">
            <MaterialPanel
              materialId={selectedMaterial.id}
              indexState={selectedMaterial.indexState}
              title={selectedMaterial.title}
              pageCount={selectedMaterial.pageCount}
              onClose={() => setSelectedMaterialId(null)}
              onStartExam={(artifactId, title) =>
                setEnteredExam({ artifactId, title, attemptId: null, remainingSeconds: null })}
              onContextChange={setScreenContext}
              onOpenCitation={openCitation}
              citationTarget={citationTarget}
              onCitationConsumed={() => setCitationTarget(null)}
              landingTarget={landingTarget}
              onLandingConsumed={() => setLandingTarget(null)}
            />
          </ErrorBoundary>
        )}
        chat={
          <ErrorBoundary label="el chat">
            <Chat proposedContext={hasMiddlePanel ? screenContext : []} />
          </ErrorBoundary>
        }
      />
    </>
  );
}
