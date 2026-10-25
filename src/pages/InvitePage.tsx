import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import Logo from '../components/Logo';
import Modal from '../components/Modal';
import type { OnboardingQuestion } from '../lib/types';

interface InviteInfo {
  community_id: string;
  name: string;
  icon_url: string | null;
  description: string;
  member_count: number;
}

interface OnboardingData {
  enabled: boolean;
  rules: string | null;
  startChannelId: string | null;
  questions: OnboardingQuestion[];
}

/** Page d'invitation publique : /invitation/:code */
export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const { sb, user } = useAuth();
  const { notify } = useNotifications();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      const { data, error } = await sb.rpc('get_invite_info', { p_code: code ?? '' });
      if (!alive) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setError('Cette invitation est invalide, expirée ou épuisée.');
        setInfo(null);
      } else {
        const row = (Array.isArray(data) ? data[0] : data) as InviteInfo;
        setInfo(row);
        // Onboarding éventuel de la communauté (silencieux si colonnes absentes).
        try {
          const [{ data: comm }, { data: qs }] = await Promise.all([
            sb.from('communities').select('onboarding_enabled,onboarding_rules,onboarding_start_channel_id').eq('id', row.community_id).maybeSingle(),
            sb.from('community_onboarding_questions').select('*').eq('community_id', row.community_id).order('position', { ascending: true }),
          ]);
          const c = comm as { onboarding_enabled?: boolean; onboarding_rules?: string | null; onboarding_start_channel_id?: string | null } | null;
          if (c?.onboarding_enabled) {
            setOnboarding({
              enabled: true,
              rules: c.onboarding_rules ?? null,
              startChannelId: c.onboarding_start_channel_id ?? null,
              questions: (qs ?? []) as OnboardingQuestion[],
            });
          }
        } catch {
          /* pas d'onboarding : adhésion directe */
        }
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb, code]);

  const join = async () => {
    if (!info) return;
    // Onboarding actif : questionnaire + règles avant l'adhésion réelle.
    if (onboarding?.enabled) {
      setShowOnboarding(true);
      return;
    }
    await doJoin(null);
  };

  const doJoin = async (onboardingAnswers: { question_id: string; option: number }[] | null) => {
    if (!info) return;
    setJoining(true);
    setError('');
    try {
      if (onboardingAnswers) {
        const { data, error } = await sb.rpc('join_with_onboarding', {
          p_code: code ?? '',
          p_answers: onboardingAnswers,
        });
        if (error) throw error;
        const res = data as { community_id: string; role: string; start_channel_id: string | null } | null;
        const cid = res?.community_id ?? (info.community_id as string);
        await notify('invitation', `Bienvenue dans ${info.name} !`, 'Tu as rejoint la communauté via une invitation.', `/app/c/${cid}`);
        navigate(res?.start_channel_id ? `/app/c/${cid}/${res.start_channel_id}` : `/app/c/${cid}`);
      } else {
        const { data, error } = await sb.rpc('join_community_via_invite', { p_code: code ?? '' });
        if (error) throw error;
        await notify('invitation', `Bienvenue dans ${info.name} !`, 'Tu as rejoint la communauté via une invitation.', `/app/c/${data as string}`);
        navigate(`/app/c/${data as string}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre.');
      setShowOnboarding(false);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-base px-4 py-8 text-ink">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 text-center shadow-xl">
        <div className="mb-4 flex justify-center">
          <Logo size={48} />
        </div>
        {loading ? (
          <p className="text-sm text-muted">Vérification de l’invitation…</p>
        ) : error ? (
          <>
            <h1 className="text-xl font-extrabold">Invitation introuvable</h1>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <Link
              to="/"
              className="mt-6 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Retour à l’accueil
            </Link>
          </>
        ) : (
          info && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Invitation à rejoindre</p>
              <div className="mt-3 flex flex-col items-center gap-2">
                {info.icon_url ? (
                  <img src={info.icon_url} alt={info.name} className="h-20 w-20 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-primary/20 text-4xl font-extrabold text-primary">
                    {info.name.trim()[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <h1 className="text-2xl font-extrabold">{info.name}</h1>
                {info.description && <p className="text-sm text-muted">{info.description}</p>}
                <p className="text-xs text-muted">
                  {info.member_count} membre{info.member_count > 1 ? 's' : ''}
                </p>
              </div>
              {user ? (
                <button
                  onClick={join}
                  disabled={joining}
                  className="mt-6 w-full rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {joining ? 'Adhésion…' : 'Rejoindre la communauté'}
                </button>
              ) : (
                <>
                  <p className="mt-4 text-sm text-muted">Connecte-toi ou crée un compte pour rejoindre.</p>
                  <div className="mt-4 flex gap-2">
                    <Link
                      to={`/connexion?retour=${encodeURIComponent(`/invitation/${code}`)}`}
                      className="flex-1 rounded-xl bg-surface2 px-4 py-2.5 text-center text-sm font-bold hover:bg-line"
                    >
                      Se connecter
                    </Link>
                    <Link
                      to={`/inscription?retour=${encodeURIComponent(`/invitation/${code}`)}`}
                      className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-bold text-white hover:opacity-90"
                    >
                      Créer un compte
                    </Link>
                  </div>
                </>
              )}
            </>
          )
        )}
      </div>
      {showOnboarding && onboarding && (
        <Modal title={`Bienvenue dans ${info?.name ?? ''}`} onClose={() => setShowOnboarding(false)}>
          <div className="space-y-5">
            {onboarding.questions.map((qq) => (
              <fieldset key={qq.id}>
                <legend className="mb-2 text-sm font-semibold">{qq.question}</legend>
                <div className="space-y-2">
                  {qq.options.map((o, i) => (
                    <label
                      key={i}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                        answers[qq.id] === i ? 'border-primary bg-primary/10' : 'border-line hover:bg-surface2'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${qq.id}`}
                        checked={answers[qq.id] === i}
                        onChange={() => setAnswers((prev) => ({ ...prev, [qq.id]: i }))}
                        className="accent-[var(--c-primary)]"
                      />
                      <span className="flex-1">{o.label}</span>
                      {o.role === 'moderateur' && <span className="text-xs font-bold text-primary">Modérateur</span>}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {onboarding.rules && (
              <div>
                <p className="mb-2 text-sm font-semibold">Règles de la communauté</p>
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">
                  {onboarding.rules}
                </div>
                <p className="mt-1 text-xs text-muted">En rejoignant, tu acceptes ces règles.</p>
              </div>
            )}
            {error && <p className="rounded-xl bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowOnboarding(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
                Annuler
              </button>
              <button
                disabled={joining || onboarding.questions.some((qq) => answers[qq.id] === undefined)}
                onClick={() =>
                  doJoin(onboarding.questions.map((qq) => ({ question_id: qq.id, option: answers[qq.id] ?? 0 })))
                }
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {joining ? 'Adhésion…' : 'Rejoindre'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
