import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { invalidateCustomEmojis } from '../lib/emojis';
import type { Community, CommunityMember, CommunityRole, CustomEmoji, CustomSticker } from '../lib/types';

interface Props {
  community: Community;
  myRole: CommunityRole;
  members: CommunityMember[];
  me: string;
  onClose: () => void;
  onChanged: () => void;
  flash: (msg: string) => void;
  onOpenModeration?: () => void;
}

/** Panneau de paramètres de la communauté (propriétaire / admin). */
export default function CommunitySettings({ community, myRole, members, me, onClose, onChanged, flash, onOpenModeration }: Props) {
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

  // Autocollants du serveur (import par les admins ; suppression sans casse :
  // l'envoi copie le fichier en pièce jointe, les anciens messages survivent).
  const [stickers, setStickers] = useState<CustomSticker[]>([]);
  const [stickerUrls, setStickerUrls] = useState<Record<string, string>>({});
  const [stickerName, setStickerName] = useState('');
  const [stickerFile, setStickerFile] = useState<File | null>(null);
  const [stickerBusy, setStickerBusy] = useState(false);
  const [renamingSticker, setRenamingSticker] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const stickerFileRef = useRef<HTMLInputElement>(null);

  const loadStickers = async () => {
    const { data, error } = await sb.from('custom_stickers').select('*').eq('community_id', community.id).order('created_at', { ascending: false });
    if (error) return;
    const list = (data ?? []) as CustomSticker[];
    setStickers(list);
    const urls: Record<string, string> = {};
    await Promise.all(
      list.map(async (s) => {
        const { data: signed } = await sb.storage.from('stickers').createSignedUrl(s.image_path, 3600);
        if (signed) urls[s.id] = signed.signedUrl;
      }),
    );
    setStickerUrls(urls);
  };

  useEffect(() => {
    loadStickers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community.id]);

  const importSticker = async () => {
    const name = stickerName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!stickerFile || name.length < 2) {
      flash('Choisis un fichier et un nom (2 caractères minimum).');
      return;
    }
    if (!['image/png', 'image/webp'].includes(stickerFile.type)) {
      flash('Format invalide : PNG ou WebP uniquement.');
      return;
    }
    if (stickerFile.size > 512 * 1024) {
      flash('Fichier trop lourd : 512 Ko maximum.');
      return;
    }
    setStickerBusy(true);
    try {
      const ext = stickerFile.type === 'image/webp' ? 'webp' : 'png';
      const path = `${community.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from('stickers').upload(path, stickerFile);
      if (upErr) throw upErr;
      const { error } = await sb.from('custom_stickers').insert({
        community_id: community.id,
        name,
        image_path: path,
        created_by: me,
      });
      if (error) throw error;
      setStickerName('');
      setStickerFile(null);
      flash('Autocollant importé.');
      await loadStickers();
      onChanged();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Import impossible.');
    } finally {
      setStickerBusy(false);
    }
  };

  const renameSticker = async (s: CustomSticker) => {
    const name = renameValue.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (name.length < 2) {
      flash('Nom invalide (2 caractères minimum).');
      return;
    }
    const { error } = await sb.from('custom_stickers').update({ name }).eq('id', s.id);
    if (error) {
      flash('Renommage impossible (nom déjà utilisé ?).');
      return;
    }
    setRenamingSticker(null);
    await loadStickers();
  };

  const deleteSticker = async (s: CustomSticker) => {
    if (!window.confirm(`Supprimer l’autocollant « ${s.name} » ? Les messages déjà envoyés ne seront pas affectés.`)) return;
    await sb.from('custom_stickers').delete().eq('id', s.id);
    await sb.storage.from('stickers').remove([s.image_path]).catch(() => {});
    flash('Autocollant supprimé.');
    await loadStickers();
  };

  // Émojis personnalisés du serveur (import par propriétaire/admin ; les
  // anciens messages affichent :nom: en texte si l'émoji est supprimé).
  const canManageEmojis = myRole === 'proprietaire' || myRole === 'admin';
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);
  const [emojiName, setEmojiName] = useState('');
  const [emojiFile, setEmojiFile] = useState<File | null>(null);
  const [emojiBusy, setEmojiBusy] = useState(false);
  const [renamingEmoji, setRenamingEmoji] = useState<string | null>(null);
  const [renameEmojiValue, setRenameEmojiValue] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const emojiFileRef = useRef<HTMLInputElement>(null);

  const loadEmojis = async () => {
    const { data, error } = await sb.from('custom_emojis').select('*').eq('community_id', community.id).order('created_at', { ascending: false });
    if (error) return;
    setEmojis((data ?? []) as CustomEmoji[]);
  };

  useEffect(() => {
    loadEmojis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community.id]);

  const pickEmojiFile = (f: File | null) => {
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(f.type)) {
      flash('Format invalide : PNG, JPG, WebP ou GIF uniquement.');
      return;
    }
    if (f.size > 1024 * 1024) {
      flash('Fichier trop lourd : 1 Mo maximum.');
      return;
    }
    setEmojiFile(f);
  };

  const importEmoji = async () => {
    const name = emojiName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!emojiFile || name.length < 2) {
      flash('Choisis un fichier et un nom (2 caractères minimum).');
      return;
    }
    setEmojiBusy(true);
    try {
      const ext = emojiFile.type === 'image/gif' ? 'gif' : emojiFile.type === 'image/jpeg' ? 'jpg' : emojiFile.type === 'image/webp' ? 'webp' : 'png';
      const path = `${community.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from('emojis').upload(path, emojiFile);
      if (upErr) throw upErr;
      const { error } = await sb.from('custom_emojis').insert({
        community_id: community.id,
        name,
        image_path: path,
        animated: emojiFile.type === 'image/gif',
        created_by: me,
      });
      if (error) throw error;
      setEmojiName('');
      setEmojiFile(null);
      flash('Émoji importé : tape :' + name + ': dans un message pour l’envoyer.');
      invalidateCustomEmojis();
      await loadEmojis();
      onChanged();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Import impossible.');
    } finally {
      setEmojiBusy(false);
    }
  };

  const renameEmoji = async (e: CustomEmoji) => {
    const name = renameEmojiValue.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (name.length < 2) {
      flash('Nom invalide (2 caractères minimum).');
      return;
    }
    const { error } = await sb.from('custom_emojis').update({ name }).eq('id', e.id);
    if (error) {
      flash('Renommage impossible (nom déjà utilisé ?).');
      return;
    }
    setRenamingEmoji(null);
    invalidateCustomEmojis();
    await loadEmojis();
  };

  const deleteEmoji = async (e: CustomEmoji) => {
    if (!window.confirm(`Supprimer l’émoji « :${e.name}: » ? Les anciens messages afficheront :${e.name}: en texte.`)) return;
    await sb.from('custom_emojis').delete().eq('id', e.id);
    await sb.storage.from('emojis').remove([e.image_path]).catch(() => {});
    flash('Émoji supprimé.');
    invalidateCustomEmojis();
    await loadEmojis();
  };

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

          {onOpenModeration && (
            <button
              onClick={onOpenModeration}
              className="w-full rounded-xl bg-surface2 px-4 py-2.5 text-sm font-bold hover:bg-line"
            >
              🛡️ Ouvrir la modération (signalements, bannis, journal)
            </button>
          )}

          <div className="rounded-2xl border border-line p-4">
            <h3 className="font-bold">Autocollants du serveur</h3>
            <p className="mt-1 text-xs text-muted">
              PNG ou WebP, 512 Ko max. Les membres de la communauté peuvent les envoyer depuis le sélecteur (onglet Autocollants).
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={stickerName}
                onChange={(e) => setStickerName(e.target.value)}
                placeholder="Nom de l’autocollant"
                maxLength={32}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={() => stickerFileRef.current?.click()}
                className="shrink-0 rounded-xl bg-surface2 px-3 py-2 text-sm font-semibold hover:bg-line"
              >
                {stickerFile ? '🖼️ Choisie' : 'Choisir…'}
              </button>
              <input
                ref={stickerFileRef}
                type="file"
                accept="image/png,image/webp"
                className="hidden"
                onChange={(e) => setStickerFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={importSticker}
                disabled={stickerBusy || !stickerFile}
                className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {stickerBusy ? '…' : 'Importer'}
              </button>
            </div>
            {stickerFile && <p className="mt-1 truncate text-xs text-muted">{stickerFile.name} ({(stickerFile.size / 1024).toFixed(0)} Ko)</p>}
            {stickers.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Aucun autocollant pour le moment.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {stickers.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-xl bg-surface2 px-3 py-2">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface">
                      {stickerUrls[s.id] ? (
                        <img src={stickerUrls[s.id]} alt={s.name} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-xs text-muted">{s.name}</span>
                      )}
                    </span>
                    {renamingSticker === s.id ? (
                      <span className="flex min-w-0 flex-1 gap-2">
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-primary"
                          autoFocus
                        />
                        <button onClick={() => renameSticker(s)} className="text-sm font-bold text-primary">OK</button>
                        <button onClick={() => setRenamingSticker(null)} className="text-sm text-muted">Annuler</button>
                      </span>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">:{s.name}:</span>
                        <button
                          onClick={() => { setRenamingSticker(s.id); setRenameValue(s.name); }}
                          className="shrink-0 text-xs text-muted hover:text-ink"
                        >
                          Renommer
                        </button>
                        <button onClick={() => deleteSticker(s)} className="shrink-0 text-xs text-muted hover:text-danger">
                          Supprimer
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canManageEmojis && (
            <div className="rounded-2xl border border-line p-4">
              <h3 className="font-bold">Émojis du serveur</h3>
              <p className="mt-1 text-xs text-muted">
                PNG, JPG, WebP ou GIF animé, 1 Mo max. Tape :nom: dans un message pour envoyer l’émoji, dans les salons comme en MP.
                Les GIF animés jouent dans le chat.
              </p>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  pickEmojiFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`mt-3 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
                  dragOver ? 'border-primary bg-primary/10' : 'border-line bg-surface2/50'
                }`}
              >
                <p className="text-sm font-semibold">{emojiFile ? `🖼️ ${emojiFile.name}` : 'Glisse une image ici, ou choisis un fichier'}</p>
                <p className="mt-1 text-xs text-muted">PNG, JPG, WebP ou GIF animé — 1 Mo maximum</p>
                <button
                  onClick={() => emojiFileRef.current?.click()}
                  className="mt-3 rounded-xl bg-surface2 px-4 py-2 text-sm font-semibold hover:bg-line"
                >
                  Choisir un fichier…
                </button>
                <input
                  ref={emojiFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => pickEmojiFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <span className="flex shrink-0 items-center rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted">:</span>
                <input
                  value={emojiName}
                  onChange={(e) => setEmojiName(e.target.value)}
                  placeholder="nom_de_lemoji"
                  maxLength={32}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <span className="flex shrink-0 items-center rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted">:</span>
                <button
                  onClick={importEmoji}
                  disabled={emojiBusy || !emojiFile}
                  className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {emojiBusy ? '…' : 'Importer'}
                </button>
              </div>
              {emojis.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Aucun émoji pour le moment.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {emojis.map((e) => {
                    const { data } = sb.storage.from('emojis').getPublicUrl(e.image_path);
                    return (
                      <li key={e.id} className="flex items-center gap-3 rounded-xl bg-surface2 px-3 py-2">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface">
                          <img src={data.publicUrl} alt={e.name} className="max-h-full max-w-full object-contain" loading="lazy" />
                        </span>
                        {renamingEmoji === e.id ? (
                          <span className="flex min-w-0 flex-1 gap-2">
                            <input
                              value={renameEmojiValue}
                              onChange={(e2) => setRenameEmojiValue(e2.target.value)}
                              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-primary"
                              autoFocus
                            />
                            <button onClick={() => renameEmoji(e)} className="text-sm font-bold text-primary">OK</button>
                            <button onClick={() => setRenamingEmoji(null)} className="text-sm text-muted">Annuler</button>
                          </span>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                              :{e.name}:{e.animated ? ' 🎞️' : ''}
                            </span>
                            <button
                              onClick={() => { setRenamingEmoji(e.id); setRenameEmojiValue(e.name); }}
                              className="shrink-0 text-xs text-muted hover:text-ink"
                            >
                              Renommer
                            </button>
                            <button onClick={() => deleteEmoji(e)} className="shrink-0 text-xs text-muted hover:text-danger">
                              Supprimer
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

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
