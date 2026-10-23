import { Link } from 'react-router-dom';
import Logo from '../components/Logo';

function Layout({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base text-ink">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-3">
          <Logo size={36} />
          <span className="text-lg font-extrabold">Kora</span>
        </Link>
        <Link to="/" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink">
          ← Retour à l’accueil
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Dernière mise à jour : {updated}</p>
        <div className="prose-kora mt-8 space-y-6 text-[15px] leading-relaxed">{children}</div>
      </main>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-2 text-xl font-bold">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-muted">{children}</p>;
}
function Li({ children }: { children: React.ReactNode }) {
  return <li className="ml-5 list-disc text-muted">{children}</li>;
}

export function Confidentialite() {
  return (
    <Layout title="Politique de confidentialité" updated="23 octobre 2026">
      <P>
        Kora est conçue pour respecter ta vie privée. Cette politique explique, en langage clair et conformément à
        la <strong className="text-ink">Loi 25 sur la protection des renseignements personnels (Québec)</strong> et
        aux lois canadiennes applicables, quelles données nous collectons et ce que nous en faisons.
      </P>
      <H>1. Données que nous collectons</H>
      <ul className="space-y-1">
        <Li><strong className="text-ink">Compte :</strong> adresse courriel, mot de passe (chiffré, jamais lisible par nous).</Li>
        <Li><strong className="text-ink">Profil :</strong> nom d’utilisateur, nom d’affichage, avatar, biographie, statuts — les informations que tu choisis de rendre visibles.</Li>
        <Li><strong className="text-ink">Contenu :</strong> messages privés et pièces jointes que tu envoies, liste d’amis, paramètres.</Li>
        <Li><strong className="text-ink">Technique :</strong> données de connexion nécessaires à la sécurité (sessions actives).</Li>
      </ul>
      <P>Nous ne collectons aucune donnée publicitaire, aucun suivi entre sites, et nous ne vendons aucune donnée.</P>
      <H>2. Sécurité — dit honnêtement</H>
      <P>
        Tes données transitent en <strong className="text-ink">TLS (chiffré)</strong> et sont chiffrées au repos
        chez notre hébergeur. En revanche, soyons transparents : <strong className="text-ink">Kora n’offre pas de
        chiffrement de bout en bout</strong> sur les messages privés en Phase 1. Tes messages sont stockés de
        façon à pouvoir te les afficher sur tes appareils, et ne sont accessibles qu’à toi et aux destinataires
        que tu choisis.
      </P>
      <H>3. Tes droits</H>
      <ul className="space-y-1">
        <Li>Droit d’accès et de rectification de tes renseignements.</Li>
        <Li>Droit de suppression : supprimer ton compte efface ton profil, tes messages et tes fichiers.</Li>
        <Li>Droit de retirer ton consentement à tout moment.</Li>
      </ul>
      <P>Pour exercer ces droits, écris-nous via la <Link to="/contact" className="text-primary underline">page contact</Link>.</P>
      <H>4. Conservation</H>
      <P>
        Nous conservons tes données tant que ton compte est actif. Les comptes inactifs et les données associées
        peuvent être supprimés après une période raisonnable d’inactivité, avec préavis.
      </P>
      <H>5. Mineurs</H>
      <P>Kora s’adresse à un public de 13 ans et plus. Nous ne collectons pas sciemment de données d’enfants de moins de 13 ans.</P>
    </Layout>
  );
}

export function Conditions() {
  return (
    <Layout title="Conditions d’utilisation" updated="23 octobre 2026">
      <P>En créant un compte Kora, tu acceptes les conditions suivantes.</P>
      <H>1. Ton compte</H>
      <ul className="space-y-1">
        <Li>Tu dois fournir une adresse courriel valide et avoir au moins 13 ans.</Li>
        <Li>Ton nom d’utilisateur est unique ; l’usurpation d’identité est interdite.</Li>
        <Li>Tu es responsable de la confidentialité de ton mot de passe. Active la double authentification, c’est gratuit.</Li>
      </ul>
      <H>2. Ton contenu</H>
      <P>
        Tu restes propriétaire de ce que tu publies. En utilisant Kora, tu nous accordes uniquement le droit
        technique de stocker et d’afficher ton contenu pour faire fonctionner le service. Tu es responsable de
        ce que tu envoies.
      </P>
      <H>3. Interdictions</H>
      <ul className="space-y-1">
        <Li>Harcèlement, discours haineux, menaces.</Li>
        <Li>Contenu illégal ou portant atteinte aux droits d’autrui.</Li>
        <Li>Spam, arnaques, tentatives de piratage ou contournement des sécurités.</Li>
      </ul>
      <H>4. Résiliation</H>
      <P>
        Tu peux supprimer ton compte à tout moment depuis les paramètres. Nous pouvons suspendre un compte qui
        viole ces conditions ou les règles de la communauté, après examen.
      </P>
      <H>5. Responsabilité</H>
      <P>
        Kora est fournie « telle quelle ». Nous faisons de notre mieux pour un service fiable, mais nous ne
        garantissons pas une disponibilité ininterrompue.
      </P>
    </Layout>
  );
}

export function Regles() {
  return (
    <Layout title="Règles de la communauté" updated="23 octobre 2026">
      <P>
        Kora est un lieu d’échange. Ces règles s’appliquent partout sur la plateforme, messages privés compris
        lorsqu’un abus nous est signalé.
      </P>
      <ul className="space-y-2">
        <Li><strong className="text-ink">Respecte les autres.</strong> Pas de harcèlement, d’insultes répétées, de menaces ni de discours haineux.</Li>
        <Li><strong className="text-ink">Pas de contenu illégal.</strong> Ni de partage de contenus portant atteinte aux droits d’autrui.</Li>
        <Li><strong className="text-ink">Pas de spam ni d’arnaques.</strong> Les liens frauduleux et les faux comptes sont supprimés.</Li>
        <Li><strong className="text-ink">Protège les mineurs.</strong> Tout contenu impliquant l’exploitation de mineurs entraîne un bannissement immédiat et un signalement aux autorités.</Li>
        <Li><strong className="text-ink">Respecte la vie privée.</strong> Ne diffuse pas les informations personnelles d’autrui sans consentement.</Li>
      </ul>
      <H>Signaler un abus</H>
      <P>
        Si quelqu’un enfreint ces règles, bloque-le et contacte-nous via la <Link to="/contact" className="text-primary underline">page contact</Link> en
        décrivant la situation. Chaque signalement est examiné par une personne réelle.
      </P>
    </Layout>
  );
}

export function Contact() {
  const email = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;
  return (
    <Layout title="Nous contacter" updated="23 octobre 2026">
      {email ? (
        <>
          <P>Une question, un signalement, une demande liée à tes données personnelles ? Écris-nous :</P>
          <p className="pt-2">
            <a
              href={`mailto:${email}`}
              className="inline-block rounded-xl bg-primary px-6 py-3 font-semibold text-white hover:opacity-90"
            >
              {email}
            </a>
          </p>
          <P>Nous répondons en général sous quelques jours ouvrés.</P>
        </>
      ) : (
        <>
          <P>
            <strong className="text-ink">Adresse de contact non configurée pour le moment.</strong>
          </P>
          <P>
            L’administrateur de cette instance Kora n’a pas encore renseigné d’adresse de contact
            (variable <code className="rounded bg-surface2 px-1">VITE_CONTACT_EMAIL</code>). En attendant,
            les demandes liées à la confidentialité peuvent être adressées au support de l’hébergeur de
            cette instance.
          </P>
        </>
      )}
    </Layout>
  );
}
