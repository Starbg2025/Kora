import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { CommunityWebhook } from '../lib/types';

/**
 * Webhooks par salon : un outil externe poste dans un salon via le RPC
 * post_webhook_message (migration 20261027). Le jeton n'est stocké que sous
 * forme de hash SHA-256 et n'est affiché qu'une seule fois, à la création.
 * Débit : 30 messages/minute par webhook, 60/minute par salon.
 */
export default function CommunityWebhooks({ community, flash }: { community: { id: string }; flash: (m: string) => void }) {
  const { sb } = useAuth();
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [hooks, setHooks] = useState<CommunityWebhook[]>([]);
  const [channelId, setChannelId] = useState('');
  const [hookName, setHookName] = useState('');
  const [newToken, setNewToken] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: ch } = await sb.from('channels').select('id,name').eq('community_id', community.id).order('position', { ascending: true });
    const list = (ch ?? []) as { id: string; name: string }[];
    setChannels(list);
    if (list.length === 0) {
      setHooks([]);
      return;
    }
    const { data } = await sb
      .from('community_webhooks')
      .select('*')
      .in('channel_id', list.map((c) => c.id))
      .order('created_at', { ascending: false });
    setHooks((data ?? []) as CommunityWebhook[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community.id]);

  const createHook = async () => {
    const name = hookName.trim().slice(0, 40);
    if (!channelId || name.length < 2) {
      flash('Choisis un salon et un nom (2 caractères minimum).');
      return;
    }
    setBusy(true);
    setNewToken('');
    try {
      const token = `kora_wh_${crypto.randomUUID()}`;
      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const hashHex = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const { error } = await sb.from('community_webhooks').insert({
        channel_id: channelId,
        name,
        token_hash: hashHex,
        created_by: (await sb.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
      setNewToken(token);
      setHookName('');
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Création impossible (migration SQL en attente ?).');
    } finally {
      setBusy(false);
    }
  };

  const deleteHook = async (id: string, name: string) => {
    if (!window.confirm(`Supprimer le webhook « ${name} » ? Il ne pourra plus poster.`)) return;
    await sb.from('community_webhooks').delete().eq('id', id);
    await load();
  };

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? 'Salon';

  return (
    <div className="rounded-2xl border border-line p-4">
      <h3 className="font-bold">Webhooks</h3>
      <p className="mt-1 text-xs text-muted">
        Un outil externe (script, bot maison, flux RSS…) peut poster dans un salon avec le jeton. Le jeton n’est
        stocké que sous forme de hash et n’est affiché qu’une seule fois. Débit : 30 messages/minute par webhook.
      </p>
      <div className="mt-3 flex gap-2">
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Salon…</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              # {c.name}
            </option>
          ))}
        </select>
        <input
          value={hookName}
          onChange={(e) => setHookName(e.target.value)}
          placeholder="Nom du webhook"
          maxLength={40}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={createHook}
          disabled={busy}
          className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          Créer
        </button>
      </div>
      {newToken && (
        <div className="mt-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          <p className="text-sm font-bold">Jeton affiché une seule fois — copie-le maintenant :</p>
          <code className="mt-1 block break-all rounded bg-surface2 px-2 py-1 font-mono text-xs">{newToken}</code>
          <p className="mt-1 text-xs text-muted">
            Utilisation : fonction Supabase <code className="font-mono">post_webhook_message(jeton, salon_id, contenu)</code>.
            Le jeton ne pourra plus être affiché.
          </p>
        </div>
      )}
      {hooks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Aucun webhook pour le moment.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {hooks.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface2 px-3 py-2">
              <span className="text-sm">
                <span className="block font-semibold">{h.name}</span>
                <span className="text-xs text-muted"># {channelName(h.channel_id)} · créé le {new Date(h.created_at).toLocaleDateString('fr-FR')}</span>
              </span>
              <button onClick={() => deleteHook(h.id, h.name)} className="shrink-0 text-xs text-danger hover:underline">
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
