import { Component, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

interface State {
  error: Error | null;
}

/**
 * Filet de sécurité : si un écran plante, affiche le message d'erreur
 * au lieu d'une page noire. L'erreur est aussi journalisée en console.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[Kora] Erreur d’affichage interceptée :', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-base px-6 text-center text-ink">
          <TriangleAlert size={40} className="mx-auto text-muted" />
          <h1 className="text-lg font-extrabold">Oups, cet écran a planté</h1>
          <p className="max-w-sm text-sm text-muted">
            {this.state.error.message || 'Erreur inconnue.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white"
          >
            Recharger l’application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
