import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Community, OnboardingQuestion } from '../lib/types';

/**
 * Onboarding de communauté : questions posées à l'arrivée (configurées par
 * les admins), puis règles, puis salon de départ. Appliqué réellement à
 * l'adhésion via le RPC join_with_onboarding (migration 20261027) :
 * les réponses attribuent le rôle « membre » ou « moderateur » (jamais
 * admin/propriétaire), puis l'utilisateur arrive sur le salon de départ.
 */
export default function CommunityOnboarding({ community, flash }: { community: Community; flash: (m: string) => void }) {
  const { sb } = useAuth();
  const [enabled, setEnabled] = useState(community.onboarding_enabled ?? false);
  const [rules, setRules] = useState(community.onboarding_rules ?? '');
  const [startChannelId, setStartChannelId] = useState(community.onboarding_start_channel_id ?? '');
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([]);
  const [qText, setQText] = useState('');
  const [qOptions, setQOptions] = useState<{ label: string; role: 'membre' | 'moderateur' }[]>([{ label: '', role: 'membre' }]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: ch }, { data: qs }] = await Promise.all([
      sb.from('channels').select('id,name').eq('community_id', community.id).order('position', { ascending: true }),
      sb.from('community_onboarding_questions').select('*').eq('community_id', community.id).order('position', { ascending: true }),
    ]);
    setChannels((ch ?? []) as { id: string; name: string }[]);
    setQuestions((qs ?? []) as OnboardingQuestion[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community.id]);

  const saveSettings = async () => {
    setBusy(true);
    try {
      const { error } = await sb
        .from('communities')
        .update({
          onboarding_enabled: enabled,
          onboarding_rules: rules.trim().slice(0, 2000) || null,
          onboarding_start_channel_id: startChannelId || null,
        })
        .eq('id', community.id);
      if (error) throw error;
      flash('Paramètres d’onboarding enregistrés.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      flash(
        msg.includes('onboarding')
          ? 'Champs non disponibles : exécute la migration 20261027_yapin_features.sql, puis réessaie.'
          : msg || 'Enregistrement impossible.',
      );
    } finally {
      setBusy(false);
    }
  };

  const addQuestion = async () => {
    const text = qText.trim().slice(0, 200);
    const options = qOptions.map((o) => ({ label: o.label.trim().slice(0, 60), role: o.role })).filter((o) => o.label);
    if (!text || options.length < 2) {
      flash('Une question avec au moins 2 réponses est requise.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb.from('community_onboarding_questions').insert({
        community_id: community.id,
        question: text,
        options,
        position: questions.length,
      });
      if (error) throw error;
      setQText('');
      setQOptions([{ label: '', role: 'membre' }]);
      await load();
      flash('Question ajoutée.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Ajout impossible.');
    } finally {
      setBusy(false);
    }
  };

  const deleteQuestion = async (id: string) => {
    await sb.from('community_onboarding_questions').delete().eq('id', id);
    await load();
  };

  return (
    <div className="rounded-2xl border border-line p-4">
      <h3 className="font-bold">Onboarding (questions à l’arrivée)</h3>
      <p className="mt-1 text-xs text-muted">
        Les nouveaux membres répondent aux questions, lisent les règles, puis arrivent sur le salon de départ. Les
        réponses peuvent attribuer le rôle « Modérateur » (jamais Administrateur ni Propriétaire).
      </p>
      <div className="mt-3 space-y-3">
        <label className="flex cursor-pointer items-center justify-between rounded-xl bg-surface2 px-4 py-3">
          <span className="text-sm font-semibold">Activer l’onboarding</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-line'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>
        <div>
          <label className="mb-1 block text-sm font-medium">Règles présentées à l’arrivée</label>
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Ex. : Sois respectueux, pas de spam, pas de contenu haineux…"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Salon de départ</label>
          <select
            value={startChannelId}
            onChange={(e) => setStartChannelId(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Premier salon (défaut)</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                # {c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={saveSettings}
          disabled={busy}
          className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          Enregistrer l’onboarding
        </button>
        <div className="border-t border-line pt-3">
          <p className="text-sm font-semibold">Questions</p>
          {questions.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Aucune question. Sans question, l’onboarding n’affiche que les règles.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {questions.map((qq) => (
                <li key={qq.id} className="flex items-start justify-between gap-2 rounded-xl bg-surface2 px-3 py-2">
                  <span className="text-sm">
                    <span className="block font-semibold">{qq.question}</span>
                    <span className="text-xs text-muted">
                      {qq.options.map((o) => `${o.label} → ${o.role === 'moderateur' ? 'Modérateur' : 'Membre'}`).join(' · ')}
                    </span>
                  </span>
                  <button onClick={() => deleteQuestion(qq.id)} className="shrink-0 text-xs text-danger hover:underline">
                    Supprimer
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="Nouvelle question…"
            maxLength={200}
            className="mt-3 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {qOptions.map((o, i) => (
            <div key={i} className="mt-2 flex gap-2">
              <input
                value={o.label}
                onChange={(e) =>
                  setQOptions((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
                placeholder={`Réponse ${i + 1}`}
                maxLength={60}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <select
                value={o.role}
                onChange={(e) =>
                  setQOptions((prev) => prev.map((x, j) => (j === i ? { ...x, role: e.target.value as 'membre' | 'moderateur' } : x)))
                }
                className="shrink-0 rounded-xl border border-line bg-surface px-2 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="membre">Membre</option>
                <option value="moderateur">Modérateur</option>
              </select>
              {qOptions.length > 1 && (
                <button
                  onClick={() => setQOptions((prev) => prev.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-lg px-2 text-muted hover:text-danger"
                  aria-label="Retirer cette réponse"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setQOptions((prev) => [...prev, { label: '', role: 'membre' as const }])}
              className="rounded-xl bg-surface2 px-3 py-2 text-sm font-semibold hover:bg-line"
            >
              ＋ Réponse
            </button>
            <button
              onClick={addQuestion}
              disabled={busy}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              Ajouter la question
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
