import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import { useFriends, type FriendEntry } from '../hooks/useFriends';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { STATUS_LABELS, type Profile } from '../lib/types';

type Tab = 'amis' | 'recues' | 'envoyees' | 'bloques';

const TABS: { id: Tab; label: string }[] = [
  { id: 'amis', label: 'Amis' },
  { id: 'recues', label: 'Demandes reçues' },
  { id: 'envoyees', label: 'Demandes envoyées' },
  { id: 'bloques', label: 'Bloqués' },
];

function presenceLabel(status: string): string {
  if (status === 'invisible' || status === 'hors_ligne') return 'Hors ligne';
  return STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
}

export default function Friends() {
  const { sb, user } = useAuth();
  const { online } = usePresence();
  const { entries, loading, reload } = useFriends();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('amis');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<Profile | null | 'none'>(null);
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<Profile | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Profile | null>(null);

  const me = user?.id ?? '';
  const friends = entries.filter((e) => e.friendship.status === 'accepted');
  const received = entries.filter((e) => e.friendship.status === 'pending' && e.friendship.addressee_id === me);
  const sent = entries.filter((e) => e.friendship.status === 'pending' && e.friendship.requester_id === me);
  const blocked = entries.filter((e) => e.friendship.status === 'blocked' && e.friendship.requester_id === me);

  const entryFor = (profileId: string) => entries.find((e) => e.profile.id === profileId);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResult(null);
    setNotice('');
    try {
      const { data, error } = await sb
        .from('profiles')
        .select('*')
        .ilike('username', q)
        .neq('id', me)
        .maybeSingle();
      if (error) throw error;
      setResult(data ? (data as Profile) : 'none');
    } catch {
      setNotice('Recherche impossible pour le moment.');
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (p: Profile) => {
    setBusyId(p.id);
    setNotice('');
    try {
      const { error } = await sb.from('friendships').insert({ requester_id: me, addressee_id: p.id });
      if (error) throw error;
      setNotice(`Demande envoyée à ${p.username}.`);
      await reload();
    } catch {
      setNotice(`${p.username} n’accepte pas les demandes d’ami pour le moment.`);
    } finally {
      setBusyId(null);
    }
  };

  const accept = async (e: FriendEntry) => {
    setBusyId(e.profile.id);
    try {
      const { error } = await sb.from('friendships').update({ status: 'accepted' }).eq('id', e.friendship.id);
      if (error) throw error;
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const removeRow = async (e: FriendEntry) => {
    setBusyId(e.profile.id);
    try {
      await sb.from('friendships').delete().eq('id', e.friendship.id);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const block = async (p: Profile) => {
    setBusyId(p.id);
    try {
      const existing = entryFor(p.id);
      if (existing) await sb.from('friendships').delete().eq('id', existing.friendship.id);
      const { error } = await sb
        .from('friendships')
        .insert({ requester_id: me, addressee_id: p.id, status: 'blocked' });
      if (error) throw error;
      setConfirmBlock(null);
      setResult(null);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const unblock = async (e: FriendEntry) => {
    setBusyId(e.profile.id);
    try {
      await sb.from('friendships').delete().eq('id', e.friendship.id);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const message = async (p: Profile) => {
    setBusyId(p.id);
    try {
      const { data, error } = await sb.rpc('create_direct_dm', { p_other: p.id });
      if (error) throw error;
      navigate(`/app/dm/${data}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Conversation impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const btn =
    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50';

  const renderRow = (e: FriendEntry) => {
    const p = e.profile;
    const st = online[p.id]?.status ?? 'hors_ligne';
    return (
      <div key={e.friendship.id} className="dm-item flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-surface2">
        <Avatar profile={p} size={44} status={st} showStatus />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{p.display_name || p.username}</p>
          <p className="truncate text-xs text-muted">
            @{p.username} · {presenceLabel(st)}
          </p>
        </div>
        {tab === 'amis' && (
          <div className="flex gap-2">
            <button onClick={() => message(p)} disabled={busyId === p.id} className={`${btn} bg-surface2 hover:bg-line`}>
              Message
            </button>
            <button onClick={() => setConfirmRemove(p)} className={`${btn} bg-surface2 text-muted hover:bg-line hover:text-ink`}>
              Retirer
            </button>
            <button onClick={() => setConfirmBlock(p)} className={`${btn} bg-surface2 text-muted hover:bg-line hover:text-danger`}>
              Bloquer
            </button>
          </div>
        )}
        {tab === 'recues' && (
          <div className="flex gap-2">
            <button onClick={() => accept(e)} disabled={busyId === p.id} className={`${btn} bg-primary text-white hover:opacity-90`}>
              Accepter
            </button>
            <button onClick={() => removeRow(e)} disabled={busyId === p.id} className={`${btn} bg-surface2 text-muted hover:bg-line hover:text-ink`}>
              Refuser
            </button>
          </div>
        )}
        {tab === 'envoyees' && (
          <button onClick={() => removeRow(e)} disabled={busyId === p.id} className={`${btn} bg-surface2 text-muted hover:bg-line hover:text-ink`}>
            Annuler
          </button>
        )}
        {tab === 'bloques' && (
          <button onClick={() => unblock(e)} disabled={busyId === p.id} className={`${btn} bg-surface2 text-muted hover:bg-line hover:text-ink`}>
            Débloquer
          </button>
        )}
      </div>
    );
  };

  const listForTab = tab === 'amis' ? friends : tab === 'recues' ? received : tab === 'envoyees' ? sent : blocked;
  const emptyText: Record<Tab, { title: string; text: string }> = {
    amis: { title: 'Aucun ami pour l’instant', text: 'Cherche un nom d’utilisateur ci-dessus pour envoyer ta première demande d’ami.' },
    recues: { title: 'Aucune demande reçue', text: 'Quand quelqu’un t’ajoutera, sa demande apparaîtra ici.' },
    envoyees: { title: 'Aucune demande envoyée', text: 'Les demandes que tu envoies apparaîtront ici en attendant la réponse.' },
    bloques: { title: 'Aucun utilisateur bloqué', text: 'Les personnes bloquées ne peuvent plus te contacter ni voir ton statut.' },
  };

  const renderSearchResult = () => {
    if (result === 'none')
      return <p className="rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">Aucun utilisateur avec ce nom exact.</p>;
    if (!result) return null;
    const existing = entryFor(result.id);
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface2 px-4 py-3">
        <Avatar profile={result} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{result.display_name || result.username}</p>
          <p className="truncate text-xs text-muted">@{result.username}</p>
          {result.bio && <p className="truncate text-xs text-muted">{result.bio}</p>}
        </div>
        {!existing && (
          <button onClick={() => sendRequest(result)} disabled={busyId === result.id} className={`${btn} bg-primary text-white hover:opacity-90`}>
            Ajouter
          </button>
        )}
        {existing?.friendship.status === 'pending' && existing.friendship.requester_id === me && (
          <span className="text-sm text-muted">Demande envoyée</span>
        )}
        {existing?.friendship.status === 'pending' && existing.friendship.addressee_id === me && (
          <button onClick={() => accept(existing)} disabled={busyId === result.id} className={`${btn} bg-primary text-white hover:opacity-90`}>
            Accepter
          </button>
        )}
        {existing?.friendship.status === 'accepted' && (
          <button onClick={() => message(result)} disabled={busyId === result.id} className={`${btn} bg-surface hover:bg-line`}>
            Message
          </button>
        )}
        {existing?.friendship.status === 'blocked' && <span className="text-sm text-muted">Bloqué</span>}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-base">
      <div className="border-b border-line px-6 py-4">
        <h1 className="text-xl font-extrabold">Amis</h1>
        <form onSubmit={search} className="mt-3 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ajouter un ami — nom d’utilisateur exact"
            className="w-full min-w-0 max-w-md rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
            aria-label="Rechercher un utilisateur par nom exact"
          />
          <button
            type="submit" disabled={searching || !query.trim()}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {searching ? '…' : 'Rechercher'}
          </button>
        </form>
        <div className="mt-3 space-y-2">{renderSearchResult()}</div>
        {notice && <p className="mt-3 rounded-xl bg-surface2 px-4 py-2.5 text-sm">{notice}</p>}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => {
            const count = t.id === 'amis' ? friends.length : t.id === 'recues' ? received.length : t.id === 'envoyees' ? sent.length : blocked.length;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                  tab === t.id ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-xs font-bold text-white">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Chargement…</p>
        ) : listForTab.length === 0 ? (
          <EmptyState title={emptyText[tab].title} text={emptyText[tab].text} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-1">{listForTab.map(renderRow)}</div>
        )}
      </div>

      {confirmBlock && (
        <Modal title="Bloquer cet utilisateur ?" onClose={() => setConfirmBlock(null)}>
          <p className="text-sm text-muted">
            <strong className="text-ink">{confirmBlock.username}</strong> ne pourra plus t’envoyer de demande
            d’ami ni voir ton statut. Votre relation d’ami sera supprimée.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setConfirmBlock(null)} className="rounded-xl bg-surface2 px-4 py-2 text-sm font-medium hover:bg-line">
              Annuler
            </button>
            <button onClick={() => block(confirmBlock)} disabled={busyId === confirmBlock.id} className="rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
              Bloquer
            </button>
          </div>
        </Modal>
      )}
      {confirmRemove && (
        <Modal title="Retirer cet ami ?" onClose={() => setConfirmRemove(null)}>
          <p className="text-sm text-muted">
            <strong className="text-ink">{confirmRemove.username}</strong> sera retiré de ta liste d’amis.
            Vos conversations existantes resteront accessibles.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setConfirmRemove(null)} className="rounded-xl bg-surface2 px-4 py-2 text-sm font-medium hover:bg-line">
              Annuler
            </button>
            <button
              onClick={() => { const e = entryFor(confirmRemove.id); setConfirmRemove(null); if (e) removeRow(e); }}
              className="rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            >
              Retirer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
