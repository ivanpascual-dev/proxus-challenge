import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { Chat } from "./components/Chat.tsx";
import { MaterialPanel } from "./components/MaterialPanel.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { materialsQuery } from "./domain/materials/atoms.ts";

export function App() {
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const materials = useAtomValue(materialsQuery);

  const selectedMaterial = selectedMaterialId === null
    ? undefined
    : AsyncResult.getOrElse(materials, () => ({ materials: [] as const }))
      .materials.find((material) => material.id === selectedMaterialId);

  const hasMiddlePanel = selectedMaterial !== undefined;

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
        selectedMaterialId={selectedMaterialId}
        onSelectMaterial={setSelectedMaterialId}
      />
      {selectedMaterial !== undefined && (
        <MaterialPanel
          key={selectedMaterial.id}
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
