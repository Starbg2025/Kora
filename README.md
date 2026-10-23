# Kora — Phase 1 : messages privés

« Rassemble ta communauté. Parle, joue, crée. »

Application React 18 + TypeScript + Vite + Tailwind CSS + Supabase.
Phase 1 : comptes, amis, messages privés (1:1 et groupes) en temps réel, profils, paramètres.

## Prérequis

- Node.js 18+
- Un projet Supabase gratuit (https://supabase.com)

## Installation

```bash
cd app
npm install
```

## Configuration Supabase (à faire une seule fois)

1. **Crée un projet** sur https://supabase.com (l'offre gratuite suffit).

2. **Exécute la migration SQL** : dans le projet Supabase, ouvre l'éditeur SQL
   (*SQL Editor* → *New query*), colle le contenu de
   `supabase/migrations/20261023_phase1.sql` et clique sur *Run*.
   Cela crée :
   - les tables `profiles`, `user_settings`, `friendships`, `dms`, `dm_members`, `messages`
   - les RLS strictes (un utilisateur ne voit que ce qui le concerne)
   - le trigger de création automatique du profil à l'inscription
   - les fonctions `username_available`, `can_receive_friend_request`, `create_direct_dm`
   - les buckets Storage `avatars` (public) et `pieces-jointes` (privé, membres du DM)
   - la publication Realtime des tables

3. **Authentification** : dans *Authentication* → *Providers*, l'authentification par
   email est active par défaut. La vérification d'email est recommandée
   (*Authentication* → *Sign In / Up* → *Confirm email*).

4. **URL du site** : dans *Authentication* → *URL Configuration*, renseigne l'URL
   de ton instance (ex. `http://localhost:5173` en dev) pour que les liens de
   vérification d'email redirigent vers `/verifier-email`.

5. **Variables d'environnement** : copie `.env.example` en `.env` et renseigne :
   - `VITE_SUPABASE_URL` : *Project Settings* → *Data API* → *Project URL*
   - `VITE_SUPABASE_ANON_KEY` : *Project Settings* → *Data API* → *anon public key*
   - (optionnel) `VITE_CONTACT_EMAIL` : adresse affichée sur la page `/contact`

## Lancement

```bash
npm run dev
```

Ouvre http://localhost:5173. Sans les variables d'environnement, un écran
« Configuration requise » s'affiche (aucune donnée de démonstration, par principe).

## Vérifications

```bash
npx tsc --noEmit   # typecheck complet
npm run build      # build de production
```

## Fonctionnalités (Phase 1)

- Landing + pages légales (`/confidentialite` Loi 25, `/conditions`, `/regles`, `/contact`)
- Inscription (email + mot de passe, vérification email, pseudo unique),
  connexion, double authentification TOTP (QR code)
- Amis : recherche par nom exact, demandes, acceptation/refus, blocage
- Messages privés 1:1 et groupes (10 max), temps réel, « en train d'écrire »,
  présence, pièces jointes, réponses, édition/suppression, recherche, sourdine
- Profil : pseudo unique, nom d'affichage, avatar, bio, statuts
- Paramètres : compte, apparence (clair/sombre/système, densité),
  notifications, confidentialité, sécurité (2FA), à propos

## Hors scope (phases suivantes)

Serveurs/salons, appels audio/vidéo, forum, scène, offre premium, bots/API,
découverte de serveurs. La landing l'indique honnêtement dans sa feuille de route.
