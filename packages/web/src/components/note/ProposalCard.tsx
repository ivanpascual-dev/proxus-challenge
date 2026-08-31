import { useAtomSet } from "@effect/atom-react";
import type { NoteBlock, NoteProposal } from "@proxus/shared";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { acceptProposalAction, rejectProposalAction } from "../../domain/artifacts/atoms.ts";
import { messageOf } from "../../lib/error-message.ts";

interface ProposalCardProps {
  readonly artifactId: string;
  readonly proposal: NoteProposal;
  readonly blocks: readonly NoteBlock[];
  // El alumno tiene cambios sin guardar: aceptar aplicaría sobre la versión del servidor y pisaría
  // su borrador. Se bloquea hasta que guarde (o descarte).
  readonly blocked: boolean;
}

const operationLabel: Record<NoteProposal["operation"]["type"], string> = {
  insert: "Añadir un bloque",
  replace: "Reescribir un bloque",
  remove: "Borrar un bloque"
};

export function ProposalCard({ artifactId, proposal, blocks, blocked }: ProposalCardProps) {
  const accept = useAtomSet(acceptProposalAction, { mode: "promise" });
  const reject = useAtomSet(rejectProposalAction, { mode: "promise" });
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | undefined>();

  const operation = proposal.operation;
  const targetBlock = operation.type === "insert"
    ? undefined
    : blocks.find((block) => block.id === operation.blockId);

  // Caducada: el bloque cambió (o desapareció) desde que el tutor la escribió. Se detecta aquí con
  // datos que la interfaz ya tiene; el servidor lo vuelve a comprobar y responde 409 (F2-29).
  const stale = operation.type === "insert"
    ? operation.afterBlockId !== null && !blocks.some((block) => block.id === operation.afterBlockId)
    : targetBlock === undefined || targetBlock.markdown !== operation.baseMarkdown;

  const run = async (kind: "accept" | "reject") => {
    setBusy(kind);
    setError(undefined);
    try {
      if (kind === "accept") {
        await accept({ id: artifactId, proposalId: proposal.id });
      } else {
        await reject({ id: artifactId, proposalId: proposal.id });
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  };

  const canAccept = !stale && !blocked && busy === null;

  return (
    <section className="grid gap-3 rounded-3xl border border-brand/40 bg-brand/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-brand text-xs uppercase tracking-widest">
          Propuesta del tutor · {operationLabel[operation.type]}
        </p>
        {stale && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.7rem] text-warning-ink">
            el bloque ha cambiado
          </span>
        )}
      </div>

      <p className="text-body text-sm">{proposal.rationale}</p>

      {operation.type === "insert" && (
        <div className="prose dark:prose-invert max-w-none rounded-xl bg-canvas/60 p-3 text-sm">
          <Streamdown>{operation.block.markdown}</Streamdown>
        </div>
      )}

      {operation.type === "replace" && (
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <p className="mb-1 text-muted text-xs">{stale ? "Lo que vio el tutor" : "Texto actual"}</p>
            <div className="prose dark:prose-invert max-w-none rounded-xl bg-canvas/60 p-3 text-sm">
              <Streamdown>{stale ? operation.baseMarkdown : (targetBlock?.markdown ?? operation.baseMarkdown)}</Streamdown>
            </div>
          </div>
          <div>
            <p className="mb-1 text-muted text-xs">Propuesta</p>
            <div className="prose dark:prose-invert max-w-none rounded-xl bg-canvas/60 p-3 text-sm">
              <Streamdown>{operation.markdown}</Streamdown>
            </div>
          </div>
        </div>
      )}

      {stale && operation.type === "replace" && (
        <div>
          <p className="mb-1 text-muted text-xs">Texto actual del bloque</p>
          <div className="prose dark:prose-invert max-w-none rounded-xl bg-canvas/60 p-3 text-sm">
            <Streamdown>{targetBlock?.markdown ?? "(el bloque ya no está en el apunte)"}</Streamdown>
          </div>
        </div>
      )}

      {operation.type === "remove" && (
        <div className="prose dark:prose-invert max-w-none rounded-xl bg-canvas/60 p-3 text-sm line-through opacity-70">
          <Streamdown>{targetBlock?.markdown ?? operation.baseMarkdown}</Streamdown>
        </div>
      )}

      {error !== undefined && (
        <p className="rounded-xl border border-danger/40 bg-danger/15 p-2 text-danger-ink text-xs">{error}</p>
      )}

      {stale
        ? (
            <p className="text-muted text-xs">
              El bloque ha cambiado desde que el tutor propuso esto, así que no se puede aplicar. Descártala y,
              si todavía hace falta, vuelve a pedírsela al tutor.
            </p>
          )
        : blocked
          ? <p className="text-muted text-xs">Guarda o descarta tus cambios del apunte antes de aceptar una propuesta.</p>
          : null}

      <div className="flex flex-wrap gap-2">
        {!stale && (
          <button
            type="button"
            className="rounded-full bg-brand px-4 py-1.5 font-semibold text-on-brand text-sm hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canAccept}
            onClick={() => run("accept")}
          >
            {busy === "accept" ? "Aplicando…" : "Aceptar"}
          </button>
        )}
        <button
          type="button"
          className="rounded-full border border-border px-4 py-1.5 text-sm hover:border-brand disabled:opacity-50"
          disabled={busy !== null}
          onClick={() => run("reject")}
        >
          {busy === "reject" ? "Descartando…" : "Descartar"}
        </button>
      </div>
    </section>
  );
}
