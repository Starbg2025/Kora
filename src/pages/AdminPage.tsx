import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';
import { formatDate } from '../lib/format';
import type { Profile } from '../lib/types';

/**
 * Panneau d'administration global de Kora — réservé aux administrateurs du
 * site (drapeau profiles.is_site_admin, posé par la migration
 * 20261025_site_admin.sql pour le créateur). La vérification est faite
 * côté serveur via is_site_admin() : un simple masquage dans l'UI ne
 * suffirait jamais.
 *
 * L'administrateur ne peut pas se désactiver lui-même (ni depuis l'UI, où
 * ses propres boutons sont absents, ni côté serveur via admin_set_disabled).
 */

interface Stats {
  users: number;
  communities: number;
  messages: number;
  pending_reports: number;
}

interface ReportRow {
  id: string;
  reporter_id: string;
  community_id: string | null;
  message_kind: string | null;
  reported_user_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

interface Announcement {
  id: string;
  text: string;
  active: boolean;
  created_at: string;
}

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harcelement: 'Harcèlement',
  contenu_inapproprie: 'Contenu inapproprié',
  autre: 'Autre',
};

export default function AdminPage() {
  const { sb, user } = useAuth();
  const [gate, setGate] = useState<'loading' | 'denied' | 'unavailable' | 'ok'>('loading');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportNames, setReportNames] = useState<Record<string, string>>({});
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    const { data: isAdmin, error: gateErr } = await sb.rpc('is_site_admin');
    if (gateErr) {
      setGate('unavailable');
      return;
    }
    if (!isAdmin) {
      setGate('denied');
      return;
    }
    setGate('ok');
    const { data: st } = await sb.rpc('admin_stats');
    if (st) setStats(st as Stats);
    const { data: reps } = await sb
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    const repRows = (reps ?? []) as ReportRow[];
    setReports(repRows);
    const ids = [...new Set(repRows.flatMap((r) => [r.reporter_id, r.reported_user_id]).filter(Boolean) as string[])];
    if (ids.length > 0) {
      const { data: profs } = await sb.from('profiles').select('id, username, display_name').in('id', ids);
      const map: Record<string, string> = {};
      for (const p of (profs ?? []) as { id: string; username: string; display_name: string }[]) {
        map[p.id] = p.display_name || p.username;
      }
      setReportNames(map);
    }
    const { data: anns } = await sb.from('site_announcements').select('*').order('created_at', { ascending: false });
    setAnnouncements((anns ?? []) as Announcement[]);
  }, [sb]);

  const loadUsers = useCallback(async () => {
    let q = sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(50);
    const s = query.trim();
    if (s) q = q.or(`username.ilike.%${s.replace(/[%_]/g, '')}%,display_name.ilike.%${s.replace(/[%_]/g, '')}%`);
    const { data } = await q;
    setUsers((data ?? []) as Profile[]);
  }, [sb, query]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (gate === 'ok') loadUsers();
  }, [gate, loadUsers]);

  const runAdmin = async (fn: () => PromiseLike<{ error: unknown }>, okMsg: string) => {
    setBusy(true);
    setError('');
    try {
      const { error } = await fn();
      if (error) throw error;
      setError(okMsg);
      await loadAll();
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (gate === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted">Vérification des droits…</p>
      </div>
    );
  }

  if (gate === 'unavailable') {
    return (
      <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <h2 className="text-lg font-extrabold">Panneau indisponible</h2>
        <p className="text-sm text-muted">
          Exécute la migration <code className="rounded bg-surface2 px-1 font-mono text-xs">20261025_site_admin.sql</code> dans
          l’éditeur SQL Supabase, puis recharge cette page.
        </p>
        <Link to="/app/dm" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">
          Retour aux discussions
        </Link>
      </div>
    );
  }

  if (gate === 'denied') {
    return (
      <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <h2 className="text-lg font-extrabold">Accès refusé</h2>
        <p className="text-sm text-muted">Cette page est réservée aux administrateurs du site Kora.</p>
        <Link to="/app/dm" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">
          Retour aux discussions
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-8 pb-10">
        <div>
          <h1 className="text-2xl font-extrabold">Panneau d’administration</h1>
          <p className="mt-1 text-sm text-muted">Administration globale de Kora — statistiques réelles, utilisateurs, signalements et annonces.</p>
        </div>

        {error && <p className="rounded-xl bg-surface2 px-4 py-2.5 text-sm">{error}</p>}

        {/* Statistiques */}
        <section>
          <h2 className="mb-3 font-bold">Vue d’ensemble</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Utilisateurs', value: stats?.users },
              { label: 'Communautés', value: stats?.communities },
              { label: 'Messages', value: stats?.messages },
              { label: 'Signalements en attente', value: stats?.pending_reports },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-surface p-4">
                <p className="text-2xl font-extrabold">{s.value ?? '—'}</p>
                <p className="text-xs text-muted">{s.label}</p>
              </div>
            ))}
          </div>
          {stats === null && (
            <p className="mt-2 text-xs text-muted">Statistiques indisponibles : la migration 20261025_site_admin.sql n’a pas encore été exécutée.</p>
          )}
        </section>

        {/* Utilisateurs */}
        <section>
          <h2 className="mb-3 font-bold">Utilisateurs</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par pseudo ou nom…"
            className="mb-3 w-full rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <div className="space-y-2">
            {users.map((u) => {
              const isMe = u.id === user?.id;
              return (
                <div key={u.id} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                  <Avatar profile={u} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                      <span className="truncate">{u.display_name || u.username}</span>
                      {u.is_verified && <VerifiedBadge size={14} />}
                      {u.is_creator && <span className="shrink-0 rounded-full bg-primary/15 px-2 py-px text-[11px] font-bold text-primary">Créateur</span>}
                      {u.is_disabled && <span className="shrink-0 rounded-full bg-danger/15 px-2 py-px text-[11px] font-bold text-danger">Désactivé</span>}
                    </p>
                    <p className="truncate text-xs text-muted">@{u.username} · inscrit le {formatDate(u.created_at)}</p>
                  </div>
                  {!isMe && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        disabled={busy}
                        onClick={() => runAdmin(() => sb.rpc('admin_set_verified', { p_user: u.id, p_verified: !u.is_verified }), u.is_verified ? 'Vérification retirée.' : 'Compte vérifié.')}
                        className="rounded-lg bg-surface2 px-3 py-1.5 text-xs font-bold hover:bg-line disabled:opacity-50"
                      >
                        {u.is_verified ? 'Retirer la vérification' : 'Vérifier'}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => runAdmin(() => sb.rpc('admin_set_disabled', { p_user: u.id, p_disabled: !u.is_disabled }), u.is_disabled ? 'Compte réactivé.' : 'Compte désactivé.')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${u.is_disabled ? 'bg-primary text-white' : 'bg-danger/15 text-danger'}`}
                      >
                        {u.is_disabled ? 'Réactiver' : 'Désactiver'}
                      </button>
                    </div>
                  )}
                  {isMe && <span className="shrink-0 text-xs text-muted">C’est toi</span>}
                </div>
              );
            })}
            {users.length === 0 && <p className="text-sm text-muted">Aucun utilisateur trouvé.</p>}
          </div>
        </section>

        {/* Signalements globaux */}
        <section>
          <h2 className="mb-3 font-bold">Signalements (tous serveurs)</h2>
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="rounded-2xl bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">
                    {REASON_LABELS[r.reason] ?? r.reason}
                    <span className="ml-2 rounded-full bg-surface2 px-2 py-px text-[11px] font-bold text-muted">{r.status}</span>
                  </p>
                  <span className="text-xs text-muted">{formatDate(r.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  Signalé par {reportNames[r.reporter_id] ?? 'un utilisateur'}
                  {r.reported_user_id ? ` · contre ${reportNames[r.reported_user_id] ?? 'un utilisateur'}` : ''}
                  {r.community_id ? ' · dans une communauté' : ' · en message privé'}
                  {r.details ? ` — ${r.details}` : ''}
                </p>
                {r.status !== 'resolu' && r.status !== 'rejete' && (
                  <div className="mt-2 flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => runAdmin(() => sb.rpc('admin_resolve_report', { p_report: r.id, p_status: 'en_cours' }), 'Signalement pris en charge.')}
                      className="rounded-lg bg-surface2 px-3 py-1.5 text-xs font-bold hover:bg-line disabled:opacity-50"
                    >
                      Prendre en charge
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => runAdmin(() => sb.rpc('admin_resolve_report', { p_report: r.id, p_status: 'resolu' }), 'Signalement résolu.')}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Résolu
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => runAdmin(() => sb.rpc('admin_resolve_report', { p_report: r.id, p_status: 'rejete' }), 'Signalement rejeté.')}
                      className="rounded-lg bg-surface2 px-3 py-1.5 text-xs font-bold hover:bg-line disabled:opacity-50"
                    >
                      Rejeter
                    </button>
                  </div>
                )}
              </div>
            ))}
            {reports.length === 0 && <p className="text-sm text-muted">Aucun signalement.</p>}
          </div>
        </section>

        {/* Annonces */}
        <section>
          <h2 className="mb-3 font-bold">Annonces du site</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const text = newAnnouncement.trim();
              if (!text) return;
              await runAdmin(() => sb.from('site_announcements').insert({ text, active: true, created_by: user?.id ?? null }), 'Annonce publiée.');
              setNewAnnouncement('');
            }}
            className="mb-3 space-y-2"
          >
            <textarea
              value={newAnnouncement}
              onChange={(e) => setNewAnnouncement(e.target.value)}
              placeholder="Écrire une annonce affichée sur la page d’accueil et dans l’application…"
              rows={2}
              className="w-full rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button disabled={busy || !newAnnouncement.trim()} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
              Publier l’annonce
            </button>
          </form>
          <div className="space-y-2">
            {announcements.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                <p className="min-w-0 flex-1 text-sm">{a.text}</p>
                <button
                  disabled={busy}
                  onClick={() => runAdmin(() => sb.from('site_announcements').update({ active: !a.active }).eq('id', a.id), a.active ? 'Annonce désactivée.' : 'Annonce activée.')}
                  className="shrink-0 rounded-lg bg-surface2 px-3 py-1.5 text-xs font-bold hover:bg-line disabled:opacity-50"
                >
                  {a.active ? 'Désactiver' : 'Activer'}
                </button>
                <button
                  disabled={busy}
                  onClick={() => runAdmin(() => sb.from('site_announcements').delete().eq('id', a.id), 'Annonce supprimée.')}
                  className="shrink-0 rounded-lg bg-danger/15 px-3 py-1.5 text-xs font-bold text-danger disabled:opacity-50"
                >
                  Supprimer
                </button>
              </div>
            ))}
            {announcements.length === 0 && <p className="text-sm text-muted">Aucune annonce.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
