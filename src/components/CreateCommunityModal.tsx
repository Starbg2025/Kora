import { useRef, useState } from 'react';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';

interface Props {
  onClose: () => void;
  onCreated: (communityId: string) => void;
}

/** Création d'une communauté : nom, description, icône optionnelle. */
export default function CreateCommunityModal({ onClose, onCreated }: Props) {
  const { sb, user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const pickIcon = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('L’icône doit être une image.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('L’icône dépasse 5 Mo.');
      return;
    }
    setError('');
    setIconFile(f);
    const reader = new FileReader();
    reader.onload = () => setIconPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const create = async () => {
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError('Donne un nom d’au moins 2 caractères à ta communauté.');
      return;
    }
    if (!user) {
      setError('Session expirée, reconnecte-toi.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data: communityId, error: rpcErr } = await sb.rpc('create_community', {
        p_name: cleanName,
        p_description: description.trim(),
      });
      if (rpcErr) throw rpcErr;
      const cid = communityId as string;
      if (iconFile) {
        const ext = iconFile.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `${user.id}/community-${cid}.${ext}`;
        const { error: upErr } = await sb.storage.from('avatars').upload(path, iconFile, { upsert: true });
        if (upErr) throw upErr;
        const { data } = sb.storage.from('avatars').getPublicUrl(path);
        const { error: updErr } = await sb.from('communities').update({ icon_url: data.publicUrl }).eq('id', cid);
        if (updErr) throw updErr;
      }
      onCreated(cid);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Créer une communauté" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface2 text-3xl font-extrabold text-muted hover:bg-line"
            title="Choisir une icône"
            aria-label="Choisir une icône"
          >
            {iconPreview ? (
              <img src={iconPreview} alt="Icône" className="h-full w-full object-cover" />
            ) : name.trim() ? (
              <span className="text-primary">{name.trim()[0].toUpperCase()}</span>
            ) : (
              <span>＋</span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickIcon(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted">
            Icône optionnelle (image, 5 Mo max). Sans icône, la première lettre du nom sera utilisée.
          </p>
        </div>
        <div>
          <label htmlFor="cc-name" className="mb-1 block text-sm font-medium">
            Nom de la communauté
          </label>
          <input
            id="cc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Ex. Cinéphiles de Montréal"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label htmlFor="cc-desc" className="mb-1 block text-sm font-medium">
            Description <span className="font-normal text-muted">(optionnel)</span>
          </label>
          <textarea
            id="cc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            rows={3}
            placeholder="De quoi parle votre communauté ?"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2"
          >
            Annuler
          </button>
          <button
            onClick={create}
            disabled={busy}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
