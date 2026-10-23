import { useRef, useState } from 'react';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import type { Community, CommunityMember, CommunityRole } from '../lib/types';

interface Props {
  community: Community;
  myRole: CommunityRole;
  members: CommunityMember[];
  me: string;
  onClose: () => void;
  onChanged: () => void;
  flash: (msg: string) => void;
}

/** Panneau de paramètres de la communauté (propriétaire / admin). */
export default function CommunitySettings({ community, myRole, members, me, onClose, onChanged, flash }: Props) {
  const { sb } = useAuth();
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [isPublic, setIsPublic] = useState(community.is_public);
  const [iconPreview, setIconPreview] = useState<string | null>(community.icon_url);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isOwner = myRole === 'proprietaire';

  const pickIcon = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024) {
      flash('Image invalide (5 Mo max).');
      return;
    }
    setIconFile(f);
    const reader = new FileReader();
    reader.onload = () => setIconPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const save = async () => {
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      flash('Le nom doit contenir au moins 2 caractères.');
      return;
    }
    setBusy(true);
    try {
      let iconUrl: string | null = community.icon_url;
      if (iconFile) {
        const ext = iconFile.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `${me}/community-${community.id}.${ext}`;
        const { error: upErr } = await sb.storage.from('avatars').upload(path, iconFile, { upsert: true });
        if (upErr) throw upErr;
        const { data } = sb.storage.from('avatars').getPublicUrl(path);
        iconUrl = data.publicUrl;
      }
      const { error } = await sb
        .from('communities')
        .update({
          name: cleanName.slice(0, 60),
          description: description.trim().slice(0, 280),
          icon_url: iconUrl,
          is_public: isPublic,
        })
        .eq('id', community.id);
      if (error) throw error;
      flash('Communauté mise à jour.');
      onChanged();
      onClose();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const doTransfer = async () => {
    if (!transferTo) return;
    setBusy(true);
    try {
      const { error } = await sb.rpc('transfer_ownership', {
        p_community: community.id,
        p_new_owner: transferTo,
      });
      if (error) throw error;
      flash('Propriété transférée.');
      setConfirmTransfer(false);
      onChanged();
      onClose();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Transfert impossible.');
    } finally {
      setBusy(false);
    }
  };

  const candidates = members.filter((m) => m.user_id !== me && m.role !== 'proprietaire');

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-extrabold">Paramètres</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink" aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface2 text-3xl font-extrabold text-muted hover:bg-line"
              title="Changer l’icône"
              aria-label="Changer l’icône"
            >
              {iconPreview ? (
                <img src={iconPreview} alt="Icône" className="h-full w-full object-cover" />
              ) : (
                <span className="text-primary">{name.trim()[0]?.toUpperCase() ?? '?'}</span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickIcon(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted">Icône de la communauté (image, 5 Mo max).</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Nom</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
              rows={3}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <label className="flex cursor-pointer items-center justify-between rounded-xl bg-surface2 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Communauté publique</span>
              <span className="block text-xs text-muted">Visible dans Découvrir, rejoignable sans invitation.</span>
            </span>
            <button
              role="switch"
              aria-checked={isPublic}
              onClick={() => setIsPublic((v) => !v)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${isPublic ? 'bg-primary' : 'bg-line'}`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${isPublic ? 'left-6' : 'left-1'}`}
              />
            </button>
          </label>
          <button
            onClick={save}
            disabled={busy}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>

          {isOwner && (
            <div className="rounded-2xl border border-danger/30 p-4">
              <h3 className="font-bold text-danger">Zone dangereuse</h3>
              <p className="mt-2 text-sm font-medium">Transférer la propriété</p>
              <p className="text-xs text-muted">Tu deviendras administrateur. Action irréversible.</p>
              <div className="mt-2 flex gap-2">
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Choisir un membre…</option>
                  {candidates.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profiles?.display_name || m.profiles?.username} ({m.role})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => transferTo && setConfirmTransfer(true)}
                  disabled={!transferTo}
                  className="shrink-0 rounded-xl bg-danger/15 px-4 py-2 text-sm font-bold text-danger hover:bg-danger/25 disabled:opacity-50"
                >
                  Transférer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmTransfer && (
        <Modal title="Transférer la propriété ?" onClose={() => setConfirmTransfer(false)}>
          <p className="text-sm text-muted">
            Tu ne seras plus propriétaire de « {community.name} ». Cette action est irréversible.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirmTransfer(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
              Annuler
            </button>
            <button
              onClick={doTransfer}
              disabled={busy}
              className="rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              Transférer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
