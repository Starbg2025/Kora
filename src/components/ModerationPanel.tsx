import { useCallback, useEffect, useId, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import { formatFull } from '../lib/format';
import {
  AUDIT_ACTION_LABELS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  type AuditLog,
  type Profile,
  type Report,
  type ReportStatus,
  type ServerBan,
  type ServerTimeout,
} from '../lib/types';

interface Props {
  communityId: string;
  communityName: string;
  onClose: () => void;
  flash: (msg: string) => void;
}

type Tab = 'signalements' | 'bannissements' | 'timeouts' | 'journal';

const STATUS_COLORS: Record<ReportStatus, string> = {
  nouveau: '#F59E0B',
  en_cours: '#3B82F6',
  resolu: '#22C55E',
  rejete: '#6B7280',
};

/** Panneau de modération d'une communauté (propriétaire / admin / modérateur). */
export default function ModerationPanel({ communityId, communityName, onClose, flash }: Props) {
  const { sb } = useAuth();
  const channelTag = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [tab, setTab] = useState<Tab>('signalements');
  const [reports, setReports] = useState<Report[]>([]);
  const [bans, setBans] = useState<ServerBan[]>([]);
  const [timeouts, setTimeouts] = useState<ServerTimeout[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());
  const [statusFilter, setStatusFilter] = useState<'tous' | ReportStatus>('tous');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const [{ data: repRows }, { data: banRows }, { data: toRows }, { data: logRows }] = await Promise.all([
      sb.from('reports').select('*').eq('community_id', communityId).order('created_at', { ascending: false }).limit(200),
      sb.from('server_bans').select('*').eq('community_id', communityId).order('created_at', { ascending: false }),
      sb.from('server_timeouts').select('*').eq('community_id', communityId).gt('expires_at', nowIso).order('expires_at'),
      sb.from('audit_logs').select('*').eq('community_id', communityId).order('created_at', { ascending: false }).limit(200),
    ]);
    const reps = (repRows ?? []) as Report[];
    const banList = (banRows ?? []) as ServerBan[];
    const toList = (toRows ?? []) as ServerTimeout[];
    const logList = (logRows ?? []) as AuditLog[];
    setReports(reps);
    setBans(banList);
    setTimeouts(toList);
    setLogs(logList);
    const ids = new Set<string>();
    for (const r of reps) {
      ids.add(r.reporter_id);
      ids.add(r.reported_user_id);
      if (r.resolved_by) ids.add(r.resolved_by);
    }
    for (const b of banList) {
      ids.add(b.user_id);
      ids.add(b.banned_by);
    }
    for (const t of toList) {
      ids.add(t.user_id);
      ids.add(t.moderator_id);
    }
    for (const l of logList) ids.add(l.actor_id);
    if (ids.size > 0) {
      const { data: profRows } = await sb.from('profiles').select('*').in('id', [...ids]);
      const map = new Map<string, Profile>();
      for (const p of (profRows ?? []) as Profile[]) map.set(p.id, p);
      setProfilesById(map);
    }
    setLoading(false);
  }, [sb, communityId]);

  useEffect(() => {
    load();
  }, [load]);

  // Temps réel : recharger quand un signalement, un ban, un timeout ou un log change
  useEffect(() => {
    const ch = sb
      .channel(`mod:${communityId}:${channelTag}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports', filter: `community_id=eq.${communityId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_bans', filter: `community_id=eq.${communityId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_timeouts', filter: `community_id=eq.${communityId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs', filter: `community_id=eq.${communityId}` }, () => load())
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, communityId, channelTag, load]);

  const nameOf = (id: string) => {
    const p = profilesById.get(id);
    return p?.display_name || p?.username || 'Inconnu';
  };

  const resolve = async (report: Report, status: ReportStatus) => {
    setBusyId(report.id);
    try {
      const { error } = await sb.rpc('resolve_report', { p_report: report.id, p_status: status });
      if (error) throw error;
      flash(`Signalement marqué « ${REPORT_STATUS_LABELS[status]} ».`);
      load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const unban = async (ban: ServerBan) => {
    if (!window.confirm(`Débannir ${nameOf(ban.user_id)} ? Il pourra rejoindre à nouveau la communauté.`)) return;
    setBusyId(ban.id);
    try {
      const { error } = await sb.rpc('unban_member', { p_community: communityId, p_user: ban.user_id });
      if (error) throw error;
      flash(`${nameOf(ban.user_id)} a été débanni.`);
      load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const filteredReports = statusFilter === 'tous' ? reports : reports.filter((r) => r.status === statusFilter);
  const newCount = reports.filter((r) => r.status === 'nouveau').length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'signalements', label: 'Signalements', badge: newCount },
    { id: 'bannissements', label: 'Bannis' },
    { id: 'timeouts', label: 'Timeouts' },
    { id: 'journal', label: 'Journal' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold">Modération</h2>
            <p className="text-xs text-muted">{communityName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink" aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                tab === t.id ? 'bg-primary text-white' : 'text-muted hover:bg-surface2 hover:text-ink'
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className={`rounded-full px-1.5 text-xs font-bold ${tab === t.id ? 'bg-white/25' : 'bg-danger/20 text-danger'}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted">Chargement…</p>
          ) : tab === 'signalements' ? (
            <div className="space-y-3">
              <div className="flex gap-1 overflow-x-auto">
                {(['tous', 'nouveau', 'en_cours', 'resolu', 'rejete'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      statusFilter === s ? 'bg-surface2 text-ink' : 'text-muted hover:bg-surface2'
                    }`}
                  >
                    {s === 'tous' ? 'Tous' : REPORT_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              {filteredReports.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">Aucun signalement dans cette catégorie.</p>
              ) : (
                filteredReports.map((r) => (
                  <div key={r.id} className="rounded-2xl bg-surface2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar profile={profilesById.get(r.reported_user_id) ?? null} size={32} />
                        <div>
                          <p className="text-sm font-semibold">
                            Signalé : {nameOf(r.reported_user_id)}
                          </p>
                          <p className="text-xs text-muted">
                            par {nameOf(r.reporter_id)} · {formatFull(r.created_at)}
                          </p>
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={{ color: STATUS_COLORS[r.status], backgroundColor: `${STATUS_COLORS[r.status]}22` }}
                      >
                        {REPORT_STATUS_LABELS[r.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">
                      <span className="font-semibold">{REPORT_REASON_LABELS[r.reason]}</span>
                      {r.details ? <span className="text-muted"> — {r.details}</span> : null}
                    </p>
                    {r.status !== 'resolu' && r.status !== 'rejete' && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {r.status === 'nouveau' && (
                          <button
                            disabled={busyId === r.id}
                            onClick={() => resolve(r, 'en_cours')}
                            className="rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-line disabled:opacity-50"
                          >
                            Prendre en charge
                          </button>
                        )}
                        <button
                          disabled={busyId === r.id}
                          onClick={() => resolve(r, 'resolu')}
                          className="rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25 disabled:opacity-50"
                        >
                          Résolu
                        </button>
                        <button
                          disabled={busyId === r.id}
                          onClick={() => resolve(r, 'rejete')}
                          className="rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:bg-line disabled:opacity-50"
                        >
                          Rejeter
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : tab === 'bannissements' ? (
            <div className="space-y-3">
              {bans.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">Aucun membre banni.</p>
              ) : (
                bans.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 rounded-2xl bg-surface2 p-3">
                    <Avatar profile={profilesById.get(b.user_id) ?? null} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{nameOf(b.user_id)}</p>
                      <p className="text-xs text-muted">
                        Banni par {nameOf(b.banned_by)} · {formatFull(b.created_at)}
                      </p>
                      <p className="text-xs text-muted">
                        {b.reason ? `Motif : ${b.reason} · ` : ''}
                        {b.expires_at ? `jusqu’au ${formatFull(b.expires_at)}` : 'Définitif'}
                      </p>
                    </div>
                    <button
                      disabled={busyId === b.id}
                      onClick={() => unban(b)}
                      className="shrink-0 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25 disabled:opacity-50"
                    >
                      Débannir
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : tab === 'timeouts' ? (
            <div className="space-y-3">
              {timeouts.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">Aucun timeout actif.</p>
              ) : (
                timeouts.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-surface2 p-3">
                    <Avatar profile={profilesById.get(t.user_id) ?? null} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{nameOf(t.user_id)}</p>
                      <p className="text-xs text-muted">
                        Par {nameOf(t.moderator_id)} · jusqu’au {formatFull(t.expires_at)}
                      </p>
                      {t.reason && <p className="text-xs text-muted">Motif : {t.reason}</p>}
                    </div>
                  </div>
                ))
              )}
              <p className="text-xs text-muted">
                Un membre en timeout ne peut plus écrire dans les salons jusqu’à l’expiration. Le timeout
                expire automatiquement.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">Aucune action enregistrée.</p>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className="flex items-start gap-3 rounded-2xl bg-surface2 px-3 py-2.5">
                    <Avatar profile={profilesById.get(l.actor_id) ?? null} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-semibold">{nameOf(l.actor_id)}</span>{' '}
                        <span className="text-muted">{AUDIT_ACTION_LABELS[l.action] ?? l.action}</span>
                        {l.target_id && l.target_type === 'user' && profilesById.get(l.target_id) && (
                          <span className="font-semibold"> → {nameOf(l.target_id)}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {formatFull(l.created_at)}
                        {l.details && typeof l.details === 'object' && (l.details as Record<string, unknown>).reason
                          ? ` · ${(l.details as Record<string, unknown>).reason as string}`
                          : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
