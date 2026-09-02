import { LIMITS } from "@proxus/shared";

// Valida un lote nuevo contra la cola local ya acumulada (decisión 6 del corte de cierre de fase 5:
// "el límite se aplica a toda la cola visible"). El único techo que gobierna aquí es `maxMaterials`,
// no `maxFilesPerUpload`: en este repo ambas cifras coinciden (5), y la plaza libre de `maxMaterials`
// es siempre la cota más estricta o igual, así que comprobar una sola vez basta.

export interface ValidateQueueAdditionInput {
  // Materiales que ya existen en el servidor, ocupando plaza de `maxMaterials`.
  readonly existingMaterials: number;
  // Nombres de fichero ya en la cola local (selecciones previas, todavía sin subir).
  readonly stagedNames: readonly string[];
  // Nombres de fichero del lote que se acaba de soltar o seleccionar.
  readonly incomingNames: readonly string[];
}

export type QueueRejectionReason =
  | {
      readonly type: "duplicate-name";
      readonly fileName: string;
    }
  | {
      readonly type: "not-enough-material-slots";
      readonly received: number;
      readonly staged: number;
      readonly existingMaterials: number;
      readonly ceiling: number;
    };

// Devuelve todas las razones de rechazo del lote nuevo, sin modificar nada: quien llama decide si
// incorpora `incomingNames` a la cola (`reasons.length === 0`) o la rechaza entera, dejando la cola
// anterior intacta.
export const validateQueueAddition = (input: ValidateQueueAdditionInput): readonly QueueRejectionReason[] => {
  const reasons: QueueRejectionReason[] = [];

  const stagedNames = new Set(input.stagedNames);
  for (const fileName of input.incomingNames) {
    if (stagedNames.has(fileName)) {
      reasons.push({ type: "duplicate-name", fileName });
    }
  }

  const slotsAvailable = Math.max(0, LIMITS.maxMaterials - input.existingMaterials - input.stagedNames.length);
  if (input.incomingNames.length > slotsAvailable) {
    reasons.push({
      type: "not-enough-material-slots",
      received: input.incomingNames.length,
      staged: input.stagedNames.length,
      existingMaterials: input.existingMaterials,
      ceiling: LIMITS.maxMaterials
    });
  }

  return reasons;
};
