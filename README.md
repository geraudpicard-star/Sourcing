# Sourcing

Outil interne de sourcing d'entreprises cibles (PME potentiellement transmissibles).
Source de données V1 : **INSEE Sirene**.

## Stack

- Next.js 14 (App Router) + TypeScript
- Supabase (PostgreSQL + Auth)
- Tailwind CSS
- Vercel (déploiement)

## Architecture

```
app/
├── api/companies/
│   ├── search/route.ts   # POST → recherche INSEE (cache-aware, server-side)
│   ├── save/route.ts     # POST → sauvegarde Supabase (RLS, user-scoped)
│   └── export/route.ts   # POST → export CSV
├── login/page.tsx
└── search/page.tsx
lib/
├── api/
│   ├── insee.ts          # Client INSEE Sirene + normalisation
│   └── insee-auth.ts     # API key (X-INSEE-Api-Key-Integration) OU OAuth2
├── db/companies.ts       # Persistance + cache
└── supabase/             # Clients SSR (browser, server, middleware)
types/
├── company.ts            # Types métier + schémas Zod
└── database.ts           # Types tables Supabase
supabase/migrations/
└── 001_initial.sql       # Schéma initial + RLS
middleware.ts             # Garde d'auth (redirige vers /login)
```

**Aucune clé d'API n'est exposée côté client.** Tous les appels INSEE passent par les routes
`/app/api/companies/*` qui s'exécutent sur le serveur Node.

## Mise en route

### 1. Installation

```bash
npm install
cp .env.local.example .env.local
```

### 2. Variables d'environnement (`.env.local`)

| Variable | Côté | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Anon key (RLS appliqué) |
| `SUPABASE_SERVICE_ROLE_KEY` | **serveur** | Pour le cache interne uniquement |
| `INSEE_API_KEY` | **serveur** | Clé API portail INSEE (recommandé depuis 2024) |
| `INSEE_OAUTH_CONSUMER_KEY` | **serveur** | Alternative : OAuth2 (legacy) |
| `INSEE_OAUTH_CONSUMER_SECRET` | **serveur** | Idem |
| `INSEE_BASE_URL` | serveur | Défaut : `https://api.insee.fr/api-sirene/3.11` |

> Soit `INSEE_API_KEY`, soit le couple OAuth2. Si les deux sont définies, l'API key prime.

### 3. Supabase

```bash
# Lier le projet
supabase link --project-ref <ref>

# Appliquer la migration
supabase db push
```

Sinon, copier-coller `supabase/migrations/001_initial.sql` dans le SQL editor.

Créer ensuite un premier utilisateur dans **Authentication → Users**.

### 4. Lancer en dev

```bash
npm run dev
# → http://localhost:3000 (redirigé vers /login si non connecté)
```

## Fonctionnalités V1

- [x] Auth obligatoire (Supabase)
- [x] Formulaire de recherche (NAF, département, commune, ancienneté min, tranche d'effectif, actif only)
- [x] Appel API INSEE Sirene server-side
- [x] Normalisation des résultats
- [x] Tableau de résultats paginé
- [x] Sauvegarde sélective en base (upsert sur SIREN)
- [x] Export CSV (page courante OU base complète)
- [x] Cache serveur 24h (table `search_cache`) pour éviter de re-requêter INSEE

## Gestion des erreurs

- `401` : non authentifié
- `400` : filtres invalides (validation Zod)
- `429` : quota INSEE dépassé (renvoyé tel quel)
- `502` : erreur INSEE en amont
- `500` : config manquante (clé API absente) ou erreur inattendue

## Limites INSEE à connaître

- Taille de page max : 1000 (clampée côté serveur).
- L'API renvoie `404` quand zéro résultat — on traite ça comme un résultat vide.
- Le champ `commune` est cherché en libellé normalisé (majuscules, sans accents).
- Le département est dérivé du code postal (gère 2A/2B et DOM 97x/98x).

## Prochaines sources (non implémentées)

- [ ] INPI (RNE / bilans)
- [ ] BODACC (annonces légales)
- [ ] Autres

> **Ne pas développer ces sources sans validation explicite.** V1 reste strictement INSEE.
