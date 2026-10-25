import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Community } from '../lib/types';
import { validHex } from '../lib/frames';

/**
 * Identité visuelle de la communauté : couleur d'accent, tag court, bannière.
 * L'accent colore l'en-tête et le salon actif (si le membre a activé
 * « Utiliser les couleurs des serveurs ») ; le tag s'affiche près du nom ;
 * la bannière s'affiche en haut de la liste des salons et se replie au
 * défilement. Stockage : bucket public « community-banners » (migration
 * 20261027), chemin <communityId>/banner-<uuid>.<ext>.
 */
export default function CommunityIdentity({ community, flash, onChanged }: { community: Community; flash: (m: string) => void; onChanged: () => void }) {
  const { sb } = useAuth();
  const [accent, setAccent] = useState(community.accent_color ?? '');
  const [tag, setTag] = useState(community.tag ?? '');
  const [bannerUrl, setBannerUrl] = useState<string | null>(community.banner_url ?? null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const ACCENT_PRESETS = ['#FF6A00', '#7C3AED', '#3B82F6', '#14B8A6', '#22C55E', '#F59E0B', '#EC4899', '#EF4444'];

  const save = async () => {
    const cleanTag = tag.trim().slice(0, 6);
    if (accent && !validHex(accent)) {
      flash('Couleur d’accent invalide (format #RRGGBB attendu).');
      return;
    }
    setBusy(true);
    try {
      let url: string | null = bannerUrl;
      if (bannerFile) {
        if (!bannerFile.type.startsWith('image/') || bannerFile.size > 5 * 1024 * 1024) {
          throw new Error('Bannière invalide (image, 5 Mo max).');
        }
        const ext = bannerFile.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `${community.id}/banner-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await sb.storage.from('community-banners').upload(path, bannerFile, { upsert: true });
        if (upErr) throw upErr;
        url = sb.storage.from('community-banners').getPublicUrl(path).data.publicUrl;
      }
      const patch = { accent_color: accent || null, tag: cleanTag || null, banner_url: url };
      const { error } = await sb.from('communities').update(patch).eq('id', community.id);
      if (error) throw error;
      setBannerUrl(url);
      setBannerFile(null);
      flash('Identité visuelle enregistrée.');
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('accent_color') || msg.includes('banner_url') || msg.includes('tag')) {
        flash('Champs non disponibles : exécute la migration 20261027_yapin_features.sql, puis réessaie.');
      } else {
        flash(msg || 'Enregistrement impossible.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line p-4">
      <h3 className="font-bold">Identité visuelle</h3>
      <p className="mt-1 text-xs text-muted">
        Couleur d’accent, tag court (6 caractères max, affiché près du nom) et bannière. Les membres qui ont désactivé
        « Utiliser les couleurs des serveurs » gardent leur propre accent.
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Couleur d’accent</label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAccent('')}
              title="Aucune (accent de l’utilisateur)"
              className={`h-9 w-9 rounded-full border border-line bg-surface2 ${accent === '' ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : 'opacity-70 hover:opacity-100'}`}
            />
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAccent(c)}
                title={c}
                style={{ backgroundColor: c }}
                className={`h-9 w-9 rounded-full ${accent === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : 'opacity-70 hover:opacity-100'}`}
              />
            ))}
            <input
              type="color"
              value={accent && validHex(accent) ? accent : '#FF6A00'}
              onChange={(e) => setAccent(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface2 p-1"
              title="Couleur personnalisée"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tag (optionnel)</label>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            maxLength={6}
            placeholder="Ex. : JEUX, TEAM"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Bannière</label>
          {bannerUrl && (
            <div className="mb-2 overflow-hidden rounded-xl">
              <img src={bannerUrl} alt="Bannière" className="h-24 w-full object-cover" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-xl bg-surface2 px-4 py-2 text-sm font-semibold hover:bg-line">
              {bannerFile ? bannerFile.name : 'Choisir une image…'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {bannerUrl && (
              <button
                type="button"
                onClick={() => {
                  setBannerUrl(null);
                  setBannerFile(null);
                }}
                className="text-xs text-muted hover:text-danger"
              >
                Retirer la bannière
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">Image, 5 Mo max. Affichée en haut de la liste des salons.</p>
        </div>
        <button
          onClick={save}
          disabled={busy}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer l’identité'}
        </button>
      </div>
    </div>
  );
}
