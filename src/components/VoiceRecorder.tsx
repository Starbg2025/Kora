import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  onDone: (file: File) => void;
  onCancel: () => void;
}

/** Enregistre un message vocal (micro du navigateur) et le renvoie comme fichier. */
export default function VoiceRecorder({ onDone, onCancel }: Props) {
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/mp4';
        const rec = new MediaRecorder(stream, { mimeType: mime });
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recRef.current = rec;
        rec.start();
        timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      } catch {
        if (alive) setError("Impossible d’accéder au micro. Vérifie l’autorisation du navigateur.");
      }
    })();
    return () => {
      alive = false;
      if (timerRef.current) window.clearInterval(timerRef.current);
      recRef.current?.stream.getTracks().forEach((t) => t.stop());
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stop = (send: boolean) => {
    const rec = recRef.current;
    if (!rec) {
      onCancel();
      return;
    }
    rec.onstop = () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (send && chunksRef.current.length > 0) {
        const type = rec.mimeType || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(chunksRef.current, { type });
        const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
        onDone(new File([blob], `Message vocal ${stamp}.${ext}`, { type }));
      } else {
        onCancel();
      }
    };
    rec.stop();
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-surface2 px-4 py-3">
        <p className="flex-1 text-sm text-danger">{error}</p>
        <button onClick={onCancel} className="rounded-xl bg-line px-4 py-2 text-sm font-bold">Fermer</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface2 px-4 py-3">
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-danger" />
      </span>
      <p className="flex-1 font-mono text-sm font-bold tabular-nums">
        {mm}:{ss} <span className="font-sans font-normal text-muted">— enregistrement…</span>
      </p>
      <button
        onClick={() => stop(false)}
        className="rounded-xl bg-line px-3 py-2 text-sm font-bold hover:opacity-80"
        aria-label="Annuler l’enregistrement"
      >
        <X size={16} />
      </button>
      <button
        onClick={() => stop(true)}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        aria-label="Envoyer le message vocal"
      >
        Envoyer
      </button>
    </div>
  );
}
