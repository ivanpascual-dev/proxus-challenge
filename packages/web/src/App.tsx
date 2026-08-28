import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { ArtifactWorkspace } from "./components/ArtifactWorkspace.tsx";
import { Chat } from "./components/Chat.tsx";
import { MaterialPanel } from "./components/MaterialPanel.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { materialsQuery } from "./domain/materials/atoms.ts";

export function App() {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const materials = useAtomValue(materialsQuery);

  const selectArtifact = (artifactId: string) => {
    setSelectedMaterialId(null);
    setSelectedArtifactId(artifactId);
  };
  const selectMaterial = (materialId: string) => {
    setSelectedArtifactId(null);
    setSelectedMaterialId(materialId);
  };

  const selectedMaterial = selectedMaterialId === null
    ? undefined
    : AsyncResult.getOrElse(materials, () => ({ materials: [] as const }))
      .materials.find((material) => material.id === selectedMaterialId);

  const hasMiddlePanel = selectedArtifactId !== null || selectedMaterial !== undefined;

  return (
    <div
      className="grid h-screen min-h-screen overflow-hidden bg-canvas text-heading"
      style={{
        gridTemplateColumns: hasMiddlePanel
          ? "340px minmax(0, 1fr) 420px"
          : "340px minmax(0, 1fr)"
      }}
    >
      <Sidebar
        selectedArtifactId={selectedArtifactId}
        selectedMaterialId={selectedMaterialId}
        onSelectArtifact={selectArtifact}
        onSelectMaterial={selectMaterial}
      />
      {selectedArtifactId !== null && <ArtifactWorkspace artifactId={selectedArtifactId} />}
      {selectedMaterial !== undefined && (
        <MaterialPanel
          materialId={selectedMaterial.id}
          indexState={selectedMaterial.indexState}
          title={selectedMaterial.title}
          pageCount={selectedMaterial.pageCount}
        />
      )}
      <Chat />
    </div>
  );
}
