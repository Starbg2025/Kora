import { useEffect, useMemo, useState } from 'react';

interface EmojiEntry {
  e: string;
  k: string; // mots-clés français pour la recherche
}

interface Category {
  name: string;
  items: EmojiEntry[];
}

const CATEGORIES: Category[] = [
  {
    name: 'Sourires et émotions',
    items: [
      { e: '😀', k: 'sourire heureux content' }, { e: '😃', k: 'sourire joie' },
      { e: '😄', k: 'sourire yeux joie' }, { e: '😁', k: 'sourire dents' },
      { e: '😆', k: 'rire yeux plissés' }, { e: '😅', k: 'sourire sueur soulagé' },
      { e: '🤣', k: 'rire pleurer mort de rire' }, { e: '😂', k: 'rire larmes joie' },
      { e: '🙂', k: 'sourire léger' }, { e: '🙃', k: 'sourire inversé ironie' },
      { e: '😉', k: 'clin œil' }, { e: '😊', k: 'sourire yeux souriants timide' },
      { e: '😇', k: 'ange innocent auréole' }, { e: '🥰', k: 'amour cœurs souriant' },
      { e: '😍', k: 'amour yeux cœurs' }, { e: '🤩', k: 'étoiles yeux impressionné' },
      { e: '😘', k: 'bisou cœur' }, { e: '😋', k: 'miam langue gourmand' },
      { e: '😛', k: 'langue' }, { e: '😜', k: 'langue clin œil fou' },
      { e: '🤪', k: 'fou langue yeux' }, { e: '😎', k: 'lunettes soleil cool' },
      { e: '🤓', k: 'intello lunettes nerd' }, { e: '🧐', k: 'monocle réfléchi' },
      { e: '😏', k: 'narquois sourire en coin' }, { e: '😒', k: 'blasé agacé' },
      { e: '😞', k: 'déçu triste' }, { e: '😔', k: 'pensif triste' },
      { e: '😟', k: 'inquiet' }, { e: '😕', k: 'confus perplexe' },
      { e: '🙁', k: 'triste fronce' }, { e: '☹️', k: 'triste mécontent' },
      { e: '😣', k: 'persévérant effort' }, { e: '😖', k: 'confus contrarié' },
      { e: '😫', k: 'fatigué' }, { e: '😩', k: 'épuisé' },
      { e: '🥺', k: 'suppliant yeux doux pitié' }, { e: '😢', k: 'pleure larme triste' },
      { e: '😭', k: 'pleure fort sanglots' }, { e: '😤', k: 'triomphe vapeur nez fier' },
      { e: '😠', k: 'énervé colère' }, { e: '😡', k: 'rouge colère furieux' },
      { e: '🤬', k: 'insultes gros mots' }, { e: '🤯', k: 'esprit explosé choqué' },
      { e: '😳', k: 'rougir gêné' }, { e: '🥵', k: 'chaud sueur canicule' },
      { e: '🥶', k: 'froid gelé' }, { e: '😱', k: 'peur cri effrayé' },
      { e: '😨', k: 'peur inquiet' }, { e: '😰', k: 'sueur peur anxieux' },
      { e: '😥', k: 'soulagé sueur triste' }, { e: '🤗', k: 'câlin bras ouverts' },
      { e: '🤔', k: 'réfléchir pense' }, { e: '🤭', k: 'rire main bouche discret' },
      { e: '🤫', k: 'chut silence secret' }, { e: '🤥', k: 'menteur nez long pinocchio' },
      { e: '😶', k: 'sans bouche muet' }, { e: '😐', k: 'neutre' },
      { e: '😑', k: 'sans expression blasé' }, { e: '😬', k: 'grimace gêné' },
      { e: '🙄', k: 'yeux au ciel agacé' }, { e: '😯', k: 'surpris bouche ouverte' },
      { e: '😮', k: 'étonné bouche ouverte' }, { e: '😲', k: 'stupéfait choqué' },
      { e: '🥱', k: 'bâiller ennui fatigue' }, { e: '😴', k: 'dormir endormi' },
      { e: '🤤', k: 'baver envie' }, { e: '😪', k: 'somnolent' },
      { e: '😷', k: 'masque malade' }, { e: '🤒', k: 'fièvre thermomètre malade' },
      { e: '🤕', k: 'bandage blessé' }, { e: '🤢', k: 'nausée malade vert' },
      { e: '🤮', k: 'vomir' }, { e: '🥴', k: 'ivre étourdi' },
    ],
  },
  {
    name: 'Gestes et mains',
    items: [
      { e: '👍', k: 'pouce levé oui ok parfait' }, { e: '👎', k: 'pouce baissé non nul' },
      { e: '👌', k: 'ok parfait main' }, { e: '✌️', k: 'victoire paix deux' },
      { e: '🤞', k: 'croiser doigts chance' }, { e: '🤟', k: 'je t aime rock' },
      { e: '🤘', k: 'rock cornes métal' }, { e: '🤙', k: 'appelle moi téléphone shaka' },
      { e: '👈', k: 'pointer gauche' }, { e: '👉', k: 'pointer droite' },
      { e: '👆', k: 'pointer haut' }, { e: '👇', k: 'pointer bas' },
      { e: '☝️', k: 'index levé un' }, { e: '✋', k: 'main levée stop' },
      { e: '🤚', k: 'dos main' }, { e: '🖐️', k: 'main ouverte cinq' },
      { e: '👋', k: 'coucou salut au revoir' }, { e: '🤏', k: 'pincer petit peu' },
      { e: '✊', k: 'poing levé force' }, { e: '👊', k: 'coup poing' },
      { e: '🤛', k: 'poing gauche' }, { e: '🤜', k: 'poing droite' },
      { e: '👏', k: 'applaudir bravo' }, { e: '🙌', k: 'mains levées youpi' },
      { e: '👐', k: 'mains ouvertes' }, { e: '🤲', k: 'paumes prière' },
      { e: '🤝', k: 'poignée main accord deal' }, { e: '🙏', k: 'prière merci s il te plaît' },
      { e: '💪', k: 'muscle fort biceps' }, { e: '🖖', k: 'vulcain spock salut' },
    ],
  },
  {
    name: 'Cœurs',
    items: [
      { e: '❤️', k: 'cœur rouge amour' }, { e: '🧡', k: 'cœur orange' },
      { e: '💛', k: 'cœur jaune' }, { e: '💚', k: 'cœur vert' },
      { e: '💙', k: 'cœur bleu' }, { e: '💜', k: 'cœur violet' },
      { e: '🖤', k: 'cœur noir' }, { e: '🤍', k: 'cœur blanc' },
      { e: '🤎', k: 'cœur marron' }, { e: '💔', k: 'cœur brisé rupture' },
      { e: '❣️', k: 'cœur exclamation' }, { e: '💕', k: 'deux cœurs amour' },
      { e: '💞', k: 'cœurs tournants' }, { e: '💓', k: 'cœur battant' },
      { e: '💗', k: 'cœur grandissant' }, { e: '💖', k: 'cœur étincelant' },
      { e: '💘', k: 'cœur flèche cupidon' }, { e: '💝', k: 'cœur ruban cadeau' },
      { e: '💟', k: 'décoration cœur' },
    ],
  },
  {
    name: 'Animaux',
    items: [
      { e: '🐶', k: 'chien' }, { e: '🐱', k: 'chat' },
      { e: '🐭', k: 'souris' }, { e: '🐹', k: 'hamster' },
      { e: '🐰', k: 'lapin' }, { e: '🦊', k: 'renard' },
      { e: '🐻', k: 'ours' }, { e: '🐼', k: 'panda' },
      { e: '🐨', k: 'koala' }, { e: '🐯', k: 'tigre' },
      { e: '🦁', k: 'lion' }, { e: '🐮', k: 'vache' },
      { e: '🐷', k: 'cochon' }, { e: '🐸', k: 'grenouille' },
      { e: '🐵', k: 'singe' }, { e: '🙈', k: 'singe cache yeux' },
      { e: '🙉', k: 'singe cache oreilles' }, { e: '🙊', k: 'singe cache bouche' },
      { e: '🐔', k: 'poule poulet' }, { e: '🐧', k: 'pingouin' },
      { e: '🐦', k: 'oiseau' }, { e: '🦄', k: 'licorne' },
      { e: '🐝', k: 'abeille' }, { e: '🦋', k: 'papillon' },
      { e: '🐢', k: 'tortue' }, { e: '🐍', k: 'serpent' },
      { e: '🐳', k: 'baleine' }, { e: '🐬', k: 'dauphin' },
      { e: '🐟', k: 'poisson' }, { e: '🦈', k: 'requin' },
    ],
  },
  {
    name: 'Nourriture',
    items: [
      { e: '🍕', k: 'pizza' }, { e: '🍔', k: 'burger hamburger' },
      { e: '🍟', k: 'frites' }, { e: '🌭', k: 'hot dog' },
      { e: '🍿', k: 'pop corn cinéma' }, { e: '🥓', k: 'bacon' },
      { e: '🥚', k: 'œuf' }, { e: '🍳', k: 'œufs friture' },
      { e: '🥞', k: 'crêpes pancakes' }, { e: '🧇', k: 'gaufre' },
      { e: '🧀', k: 'fromage' }, { e: '🥗', k: 'salade' },
      { e: '🍝', k: 'spaghetti pâtes' }, { e: '🍜', k: 'ramen nouilles bol' },
      { e: '🍲', k: 'pot ragoût' }, { e: '🍣', k: 'sushi' },
      { e: '🍱', k: 'bento' }, { e: '🥟', k: 'ravioli dumpling' },
      { e: '🍤', k: 'crevette' }, { e: '🍚', k: 'riz' },
      { e: '🍪', k: 'cookie biscuit' }, { e: '🎂', k: 'gâteau anniversaire' },
      { e: '🍰', k: 'part gâteau' }, { e: '🧁', k: 'cupcake' },
      { e: '🍫', k: 'chocolat' }, { e: '🍩', k: 'donut beigne' },
      { e: '🍎', k: 'pomme' }, { e: '🍌', k: 'banane' },
      { e: '🍇', k: 'raisin' }, { e: '🍓', k: 'fraise' },
      { e: '☕', k: 'café' }, { e: '🧋', k: 'bubble tea' },
      { e: '🥤', k: 'soda boisson paille' }, { e: '🍺', k: 'bière' },
    ],
  },
  {
    name: 'Activités',
    items: [
      { e: '⚽', k: 'football soccer ballon' }, { e: '🏀', k: 'basket' },
      { e: '🏈', k: 'football américain' }, { e: '⚾', k: 'baseball' },
      { e: '🎾', k: 'tennis' }, { e: '🏐', k: 'volleyball' },
      { e: '🎱', k: 'billard 8' }, { e: '🏓', k: 'ping pong' },
      { e: '🏸', k: 'badminton' }, { e: '🥅', k: 'but cage' },
      { e: '🎮', k: 'jeu vidéo manette gaming' }, { e: '🕹️', k: 'joystick arcade' },
      { e: '🎲', k: 'dé' }, { e: '🧩', k: 'puzzle' },
      { e: '🎯', k: 'cible fléchette' }, { e: '🎳', k: 'bowling' },
      { e: '🎭', k: 'théâtre masques' }, { e: '🎨', k: 'peinture art palette' },
      { e: '🎬', k: 'cinéma clap' }, { e: '🎤', k: 'micro chant karaoké' },
      { e: '🎧', k: 'casque écouteurs musique' }, { e: '🎼', k: 'musique partition' },
      { e: '🎹', k: 'piano' }, { e: '🥁', k: 'batterie tambour' },
      { e: '🎸', k: 'guitare' }, { e: '🎺', k: 'trompette' },
      { e: '🎻', k: 'violon' },
    ],
  },
  {
    name: 'Objets',
    items: [
      { e: '💡', k: 'ampoule idée' }, { e: '🔦', k: 'lampe torche' },
      { e: '📱', k: 'téléphone portable smartphone' }, { e: '💻', k: 'ordinateur portable' },
      { e: '⌨️', k: 'clavier' }, { e: '🖥️', k: 'écran ordinateur' },
      { e: '🖱️', k: 'souris' }, { e: '💾', k: 'disquette sauvegarde' },
      { e: '💿', k: 'cd disque' }, { e: '📷', k: 'appareil photo' },
      { e: '🎥', k: 'caméra cinéma' }, { e: '📺', k: 'télévision' },
      { e: '📻', k: 'radio' }, { e: '⏰', k: 'réveil alarme' },
      { e: '⌛', k: 'sablier temps' }, { e: '🔋', k: 'batterie pile' },
      { e: '🔌', k: 'prise électrique' }, { e: '🔑', k: 'clé' },
      { e: '🔨', k: 'marteau' }, { e: '🔧', k: 'clé outil' },
      { e: '💰', k: 'argent sac' }, { e: '💵', k: 'billet dollar' },
      { e: '🎁', k: 'cadeau' }, { e: '🎈', k: 'ballon fête' },
      { e: '🎉', k: 'fête confettis' }, { e: '✉️', k: 'enveloppe lettre mail' },
      { e: '📦', k: 'colis paquet' }, { e: '🔒', k: 'cadenas verrouillé' },
      { e: '🔓', k: 'déverrouillé ouvert' }, { e: '🚗', k: 'voiture auto' },
      { e: '✈️', k: 'avion voyage' }, { e: '🚀', k: 'fusée' },
    ],
  },
  {
    name: 'Symboles',
    items: [
      { e: '✅', k: 'coché validé oui' }, { e: '❌', k: 'croix non faux' },
      { e: '❓', k: 'question' }, { e: '❗', k: 'exclamation attention' },
      { e: '💯', k: 'cent parfait 100' }, { e: '🔥', k: 'feu chaud lit' },
      { e: '✨', k: 'étincelles brillant nouveau' }, { e: '⭐', k: 'étoile' },
      { e: '🌟', k: 'étoile brillante' }, { e: '💥', k: 'explosion boom' },
      { e: '💤', k: 'dormir zzz' }, { e: '💢', k: 'colère symbole' },
      { e: '🚫', k: 'interdit non' }, { e: '⛔', k: 'interdit entrée' },
      { e: '⚠️', k: 'avertissement attention' }, { e: '♻️', k: 'recyclage' },
      { e: '💲', k: 'dollar argent' }, { e: '™️', k: 'marque' },
    ],
  },
];

const FREQ_KEY = 'kora:freq-emojis';
const MAX_FREQ = 24;

function loadFreq(): string[] {
  try {
    const raw = localStorage.getItem(FREQ_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, MAX_FREQ) : [];
  } catch {
    return [];
  }
}

export function recordEmojiUse(emoji: string) {
  try {
    const cur = loadFreq().filter((e) => e !== emoji);
    localStorage.setItem(FREQ_KEY, JSON.stringify([emoji, ...cur].slice(0, MAX_FREQ)));
  } catch {
    /* stockage indisponible */
  }
}

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/** Sélecteur d'émojis façon Discord : onglets, recherche, fréquemment utilisés. */
export default function EmojiPicker({ onPick, onClose }: Props) {
  const [tab, setTab] = useState<'emoji' | 'gif' | 'stickers'>('emoji');
  const [q, setQ] = useState('');
  const [freq, setFreq] = useState<string[]>(() => loadFreq());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    const out: Category[] = [];
    for (const c of CATEGORIES) {
      const items = c.items.filter((it) => it.k.includes(needle));
      if (items.length > 0) out.push({ name: c.name, items });
    }
    return out;
  }, [q]);

  const pick = (emoji: string) => {
    recordEmojiUse(emoji);
    setFreq(loadFreq());
    onPick(emoji);
  };

  const grid = (items: EmojiEntry[]) => (
    <div className="grid grid-cols-8 gap-1">
      {items.map((it) => (
        <button
          key={it.e + it.k}
          onClick={() => pick(it.e)}
          className="flex h-10 items-center justify-center rounded-lg text-2xl hover:bg-surface2"
          title={it.k}
        >
          {it.e}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-label="Sélecteur d'émojis">
      <button aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative flex max-h-[80dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl sm:max-w-md sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex gap-1 border-b border-line px-4 pt-2">
          {(
            [
              ['emoji', 'Émoji'],
              ['gif', 'GIF'],
              ['stickers', 'Autocollants'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                tab === id ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab !== 'emoji' ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <p className="text-4xl">{tab === 'gif' ? '🎞️' : '😺'}</p>
            <p className="mt-3 font-bold">{tab === 'gif' ? 'GIF' : 'Autocollants'} — bientôt disponible</p>
            <p className="mt-1 text-sm text-muted">
              {tab === 'gif'
                ? 'La recherche de GIF animés arrive dans une prochaine mise à jour.'
                : 'Les packs d’autocollants arrivent dans une prochaine mise à jour.'}
            </p>
          </div>
        ) : (
          <>
            <div className="px-4 pt-3">
              <div className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-3 py-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-muted">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Trouve l’émoji parfait"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {filtered ? (
                filtered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">Aucun émoji trouvé pour « {q} ».</p>
                ) : (
                  filtered.map((c) => (
                    <div key={c.name} className="mb-4">
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{c.name}</p>
                      {grid(c.items)}
                    </div>
                  ))
                )
              ) : (
                <>
                  {freq.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Fréquemment utilisés</p>
                      {grid(freq.map((e) => ({ e, k: e })))}
                    </div>
                  )}
                  {CATEGORIES.map((c) => (
                    <div key={c.name} className="mb-4">
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{c.name}</p>
                      {grid(c.items)}
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
