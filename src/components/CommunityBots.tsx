import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Bot, BotServer } from '../lib/types';

/**
 * Bots du serveur : liste les bots ajoutés à cette communauté (annuaire
 * limité aux serveurs de l'utilisateur — pas d'annuaire public « vérifié »).
 * L'ajout se fait depuis les bots que l'utilisateur possède (créés dans
 * Paramètres > Avancé) ; le retrait coupe immédiatement la publication.
 * Un bot ne poste que dans les serveurs où il a été ajouté, via le RPC
 * post_bot_message, avec les mêmes limites de débit que les webhooks.
 */
export default function CommunityBots({ community, flash }: { community: { id: string }; flash: (m: string) => void }) {
  const { sb, user } = useAuth();
  const [myBots, setMyBots] = useState<Bot[]>([]);
  const [added, setAdded] = useState<{ bot_id: string; name: string; added_at: string }[]>([]);
  const [selectedBot, setSelectedBot] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const [{ data: bots }, { data: rows }] = await Promise.all([
      sb.from('bots').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
      sb.from('bot_servers').select('bot_id, community_id, added_by, created_at').eq('community_id', community.id),
    ]);
    const botList = (bots ?? []) as Bot[];
    setMyBots(botList);
    const addedRows = (rows ?? []) as BotServer[];
    if (addedRows.length === 0) {
      setAdded([]);
      return;
    }
    const { data: names } = await sb.from('bots').select('id,name').in('id', addedRows.map((r) => r.bot_id));
    const byId = new Map(((names ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
    setAdded(addedRows.map((r) => ({ bot_id: r.bot_id, name: byId.get(r.bot_id) ?? 'Bot', added_at: r.created_at })));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community.id, user?.id]);

  const addBot = async () => {
    if (!selectedBot) return;
    setBusy(true);
    try {
      const { error } = await sb.from('bot_servers').insert({ bot_id: selectedBot, community_id: community.id });
      if (error) throw error;
      setSelectedBot('');
      await load();
      flash('Bot ajouté au serveur.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Ajout impossible (migration SQL en attente ?).');
    } finally {
      setBusy(false);
    }
  };

  const removeBot = async (botId: string, name: string) => {
    if (!window.confirm(`Retirer le bot « ${name} » de ce serveur ? Il ne pourra plus y poster.`)) return;
    await sb.from('bot_servers').delete().eq('bot_id', botId).eq('community_id', community.id);
    await load();
  };

  const available = myBots.filter((b) => !added.some((a) => a.bot_id === b.id));

  return (
    <div className="rounded-2xl border border-line p-4">
      <h3 className="font-bold">Bots du serveur</h3>
      <p className="mt-1 text-xs text-muted">
        Seuls les bots ajoutés ici peuvent poster dans cette communauté. Crée tes bots dans Paramètres &gt; Avancé,
        puis ajoute-les ici. Aucun annuaire public « vérifié » : cette liste ne montre que les bots de ce serveur.
      </p>
      {available.length > 0 && (
        <div className="mt-3 flex gap-2">
          <select
            value={selectedBot}
            onChange={(e) => setSelectedBot(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Choisir un de tes bots…</option>
            {available.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            onClick={addBot}
            disabled={busy || !selectedBot}
            className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      )}
      {added.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Aucun bot dans ce serveur.
          {myBots.length === 0 && ' Crée d’abord un bot dans Paramètres > Avancé.'}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {added.map((a) => (
            <li key={a.bot_id} className="flex items-center justify-between gap-2 rounded-xl bg-surface2 px-3 py-2">
              <span className="text-sm">
                <span className="block font-semibold">
                  {a.name} <span className="ml-1 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">BOT</span>
                </span>
                <span className="text-xs text-muted">Ajouté le {new Date(a.added_at).toLocaleDateString('fr-FR')}</span>
              </span>
              <button onClick={() => removeBot(a.bot_id, a.name)} className="shrink-0 text-xs text-danger hover:underline">
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
