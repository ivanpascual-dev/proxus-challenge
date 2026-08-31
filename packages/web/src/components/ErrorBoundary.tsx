import { Component, type ErrorInfo, type ReactNode } from "react";

// La red de seguridad de render. Una excepción lanzada mientras React pinta (un `undefined` donde se
// esperaba un objeto, un `.map` sobre algo que no es lista) desmonta el árbol entero: sin esto, la
// página se queda en blanco y sin decir nada, que es justo lo que prohíbe la invariante 3. Aquí se
// corta la caída, se nombra qué parte no se ha podido dibujar y se dan las dos salidas: reintentar el
// render (por si fue algo puntual y así no se pierde el chat en memoria) o recargar del todo.
//
// No sustituye a los cuatro estados de cada vista que pide datos: un error esperado (red, 404, 409)
// se maneja donde ocurre. Esto es solo para el fallo de código que se cuela hasta el render.

interface Props {
  readonly children: ReactNode;
  // Qué se estaba mostrando, para el texto del aviso: "No se ha podido mostrar <label>". Sin `label`,
  // el aviso es el genérico de aplicación.
  readonly label?: string;
}

interface State {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // El detalle técnico va a la consola del navegador, nunca a la pantalla (error-message.ts).
    console.error("Fallo en render capturado por ErrorBoundary:", error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }

    const { label } = this.props;
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-canvas p-8 text-center">
        <div className="max-w-md">
          <h2 className="font-bold text-heading text-lg">
            {label === undefined
              ? "La aplicación no ha podido dibujar la pantalla"
              : `No se ha podido mostrar ${label}`}
          </h2>
          <p className="mt-2 text-muted text-sm">
            Es un fallo de la aplicación, no de nada que hayas hecho. Vuelve a intentarlo; si sigue
            igual, recarga la página.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={this.reset}
            className="rounded-full bg-brand px-5 py-2 font-semibold text-on-brand text-sm hover:bg-brand/90"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-border-strong px-5 py-2 text-body text-sm hover:border-brand"
          >
            Recargar la página
          </button>
        </div>
      </div>
    );
  }
}
