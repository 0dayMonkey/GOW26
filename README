# Monopoly 3D — Buffapoly

> Projet **Games on the Web 2026** — Une adaptation 3D du Monopoly français réalisée avec **Babylon.js 7** et **TypeScript**.

🎮 **Jeu hébergé** : [https://buffapoly.vercel.app](https://buffapoly.vercel.app) **LE LIEN REEL A METTRE JFNGJSFNSF**

📦 **Repository** : [https://github.com/0dayMonkey/GOW26](https://github.com/0dayMonkey/GOW26)

---

## 📋 Table des matières

1. [Présentation du projet](#présentation-du-projet)
2. [Stack technique](#stack-technique)
3. [Installation et lancement](#installation-et-lancement)
4. [Structure du repository](#structure-du-repository)
5. [Rapport de conception](#rapport-de-conception)
6. [Partie personnelle](#partie-personnelle)

--- 

## Présentation du projet

**Buffapoly** est une version 3D jouable dans le navigateur du Monopoly classique (édition française). Le jeu oppose 1 joueur humain à 1 à 3 IA, sur le plateau standard de 40 cases avec toutes les règles officielles : propriétés, gares, compagnies, cartes Chance et Caisse de Communauté, prison, construction de maisons/hôtels, faillites, etc.

### Fonctionnalités principales

- ✅ Plateau 3D complet avec texture 2048×2048 générée dynamiquement
- ✅ Dés avec simulation physique (gravité, rebonds, friction)
- ✅ 4 pions procéduraux distincts (chapeau, fer, voiture, dé)
- ✅ Animation des déplacements case par case avec petits sauts
- ✅ Caméra cinématique avec zooms automatiques et transitions douces
- ✅ Post-processing (SSAO2 + Bloom + ACES + FXAA)
- ✅ Carte Monopoly 3D affichée au survol de la case du joueur
- ✅ IA avec heuristiques (évaluation d'achat, priorités de construction)
- ✅ Interface DOM (HUD, panneau d'actions, notifications, panneau de propriétés)
- ✅ Sons procéduraux via Web Audio API (aucun fichier audio nécessaire)
- ✅ 100+ tests unitaires avec Vitest (couverture > 75%)

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Rendu 3D | Babylon.js 7.54 (Core + GUI + Loaders) |
| Langage | TypeScript 5.4 (strict mode) |
| Bundler | Vite 5.4 |
| Tests | Vitest 2.0 + V8 Coverage |
| Lint/Format | ESLint 8 + Prettier 3 |
| CI | GitHub Actions (typecheck + lint + tests + build) |

---

## Installation et lancement

```bash
# Installation
npm install

# Lancement en dev (http://localhost:3000)
npm run dev

# Build production
npm run build

# Tests
npm run test
npm run test:coverage

# Lint + format
npm run lint
npm run format
```

### Options d'URL

- `?ai=1` → 1 IA (par défaut)
- `?ai=2` → 2 IA
- `?ai=3` → 3 IA (4 joueurs au total)

### Contrôles clavier

| Touche | Action |
|--------|--------|
| `Espace` / `Entrée` | Lancer les dés |
| `B` | Acheter la propriété |
| `N` | Décliner l'achat |
| `E` | Fin de tour |
| `P` | Payer amende de prison |
| `C` | Utiliser carte "Sortie de prison" |
| `T` | Afficher/masquer le panneau des propriétés |

---

## Structure du repository

```
monopoly-3d-babylonjs/
├── src/
│   ├── game-logic/          # Règles pures (aucun import Babylon.js)
│   │   ├── board/           # Plateau, 40 cases, groupes de couleurs
│   │   ├── cards/           # 20 cartes (Chance + Caisse)
│   │   ├── player/          # Création/manipulation des joueurs
│   │   ├── rules/           # Dés, mouvement, loyer, prison, construction
│   │   ├── state/           # GameState et mutations
│   │   └── types.ts         # Types partagés
│   │
│   ├── application/         # Orchestration (machine à états, commandes)
│   │   ├── ai/              # IA : contrôleur + stratégie
│   │   ├── commands/        # Pattern Command sérialisable
│   │   ├── game-controller.ts
│   │   ├── turn-manager.ts  # State machine des phases de tour
│   │   └── command-queue.ts
│   │
│   ├── infrastructure/      # EventBus, Logger, AssetLoader
│   │
│   └── presentation/        # Rendu 3D + UI DOM
│       ├── board/           # Construction plateau + texture
│       ├── pawns/           # Pions procéduraux + animation
│       ├── dice/            # Dés avec simulation physique
│       ├── buildings/       # Maisons/hôtels (InstancedMesh)
│       ├── camera/          # Caméra cinématique
│       ├── lighting/        # Éclairage 3 points + ombres PCF
│       ├── post-processing/ # SSAO + Bloom + ACES + FXAA
│       ├── audio/           # Sons procéduraux Web Audio
│       ├── ui/              # HUD, panels, notifications, hover-card
│       ├── scene-manager.ts
│       └── main.ts          # Point d'entrée
│
├── tests/                   # Tests unitaires Vitest (>100 tests)
├── public/                  # Assets statiques
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

### Architecture en couches

Nous avons structuré le code en **4 couches strictement indépendantes** :

1. **`game-logic`** : règles pures, 100% testables, aucune dépendance externe
2. **`application`** : orchestration via EventBus, machine à états
3. **`infrastructure`** : EventBus typé, Logger, AssetLoader
4. **`presentation`** : tout ce qui touche à Babylon.js et au DOM

Les dépendances vont uniquement vers le bas. La couche `game-logic` ne connaît ni Babylon.js, ni le DOM, ce qui permet de tester toute la logique de jeu en isolation.

---

## Rapport de conception

### 1. Pourquoi le Monopoly ?

Le Monopoly représente un défi intéressant car il combine :
- Des **règles complexes et interconnectées** (monopoles, construction équitable, faillite avec transfert d'actifs, règles spéciales de la prison...)
- Un **plateau reconnaissable** qui se prête bien à une adaptation 3D visuellement marquante
- Un **gameplay asynchrone** (tour par tour) qui simplifie la synchronisation des animations
- Une **possibilité d'IA** non triviale (évaluation de propriétés, stratégie de construction)

D'autres idées envisagées (Puissance 4 3D, Échecs 3D, un jeu type "rogue-like") auraient été soit trop simples visuellement, soit trop lourdes à implémenter en règles. Le Monopoly offre le meilleur équilibre entre ambition technique et faisabilité sur la durée du projet.

### 2. Choix de Babylon.js

Three.js était une alternative crédible, mais Babylon.js a été retenu pour plusieurs raisons :
- **Outillage intégré** : ArcRotateCamera, DefaultRenderingPipeline, ShadowGenerator, SSAO2, ActionManager, on obtient beaucoup "gratuitement"
- **TypeScript natif** : types complets sans `@types/*`
- **Documentation et Playground** supérieurs pour débugger
- **PBRMaterial** prêt à l'emploi pour un rendu premium

### 3. Architecture : pourquoi 4 couches ?

Nous avons choisi une **Clean Architecture simplifiée** pour isoler la logique métier. Concrètement :

- La couche `game-logic` est testable sans navigateur (tests en Node)
- On peut en théorie remplacer Babylon.js par Three.js sans toucher aux règles
- L'EventBus typé découple complètement le rendu du gameplay : quand le `GameController` émet `dice:rolled`, le `DiceRenderer`, le `HudOverlay` et l'`AudioManager` réagissent indépendamment

Cette séparation a un **coût** : beaucoup de fichiers courts, une discipline d'imports à respecter. Mais elle a **payé** dès qu'il a fallu déboguer des problèmes de synchronisation entre règles et animations.

### 4. EventBus typé

Le fichier `infrastructure/event-bus.ts` définit une interface `GameEvents` qui liste **tous** les événements du jeu avec leur payload exact. TypeScript vérifie à la compilation que chaque `emit()` et chaque `on()` utilise le bon type.

Exemple :
```ts
eventBus.emit('dice:rolled', { values: [3, 4], isDouble: false });
eventBus.on('pawn:moved', (data) => { /* data est typé */ });
```

Cela évite des classes entières de bugs (typos dans les noms d'événements, payloads incorrects).

### 5. Machine à états du tour

Le `TurnManager` définit les transitions valides :

```
WAITING_FOR_ROLL → ROLLING → MOVING → ACTION → BUILDING → END_TURN → WAITING_FOR_ROLL
```

Des transitions alternatives existent (3 doubles → prison directe, envoyé en prison pendant le déplacement). Les transitions invalides **throw** une erreur, ce qui nous a permis de détecter très tôt des bugs d'orchestration.

### 6. Synchronisation animations / règles

**Le problème le plus délicat du projet.** Quand le joueur lance les dés, la règle s'applique instantanément (la position du joueur change dans l'état), mais l'animation du pion prend plusieurs centaines de millisecondes. Il faut :

1. Lancer l'animation des dés
2. Attendre `dice:animation:complete`
3. Calculer le déplacement et l'animer case par case
4. Attendre `pawn:animation:complete`
5. **Seulement ensuite** proposer l'achat / payer le loyer / tirer une carte

Nous avons utilisé un système d'attente basé sur les événements (`waitingForDiceAnimation`, `waitingForPawnAnimation`, `pendingAfterPawnAction`) pour sérialiser ces étapes sans bloquer le thread principal.

### 7. IA : heuristiques simples mais efficaces

L'IA n'utilise **pas** de minimax (trop coûteux pour un Monopoly avec tant d'états). À la place, elle évalue chaque décision par un score :

- **Achat** : bonus si complète un monopole (+25), si déjà un membre du groupe (+15), si case à fort trafic (+10), malus si solde < 300€ après achat (-20)
- **Construction** : priorité orange/rouge > jaune/vert > bleu foncé/rose, solde minimum 500€

C'est simple, rapide, et donne une IA "compétente" qui fait les bons choix évidents sans jouer parfaitement.

### 8. Texture du plateau générée dynamiquement

Au lieu d'avoir un fichier PNG du plateau, nous générons la texture 2048×2048 au runtime avec l'API Canvas 2D (`BoardTextureGenerator`). Avantages :
- Pas d'asset à maintenir
- Facilement modifiable (couleurs, noms, prix)
- Un seul mesh plateau = **1 draw call** au lieu de 40+

**Piège rencontré** : la face `+Y` du `CreateBox` de Babylon.js mappe les UV en miroir horizontal. Il a fallu appliquer `ctx.scale(-1, 1)` au début du dessin pour compenser. C'est documenté dans le code.

### 9. Dés : animation physique keyframe

Plutôt que d'utiliser Havok/Cannon (overhead), nous avons implémenté une simulation physique minimale dans `dice-renderer.ts` : gravité, rebonds, friction, détection de repos, puis snap sur la face cible. Le résultat paraît naturel sans dépendance lourde.

**Bug corrigé** : la fonction `quatFromUnitVectors` avait un cas anti-parallèle incorrect (`FromEulerAngles` utilisé avec les composantes d'un vecteur, mathématiquement faux). Corrigé avec `Quaternion.RotationAxis(perp, Math.PI)`.

### 10. Tests

Plus de **100 tests unitaires** couvrent la logique pure : dés, mouvement, loyers (incluant monopoles, gares, compagnies), prison, cartes, construction, EventBus, Logger. La couverture dépasse 75% sur les couches `game-logic`, `application` et `infrastructure`. La couche `presentation` n'est pas testée unitairement (nécessiterait un DOM + contexte WebGL mockés).

---

## Partie personnelle

### Répartition du travail

**Groupe de 2 personnes** :
- **Salima Mazaev** : 50%
- **Naim Harib** : 50%

---

### Salima Mazaev - 50%

Alors pour ma part, j'étais un peu perdue parce que j'avais encore jamais touché à babylon.js. J'ai fait un peu de three.js en perso mais c'était basique donc là c'était vraiment nouveau.

**Ce que j'ai fait dans le projet** :

Pour rsumé, je me suis occupée surtout de toute la partie logique du jeu (le dossier game-logic) et la couche application. Concretement ça veut dire:
- j'ai écrit toutes les règles : les dés, le mouvement des joueurs, les loyers (c'est plus compliqué que ce qu'on croit avec les monopoles, les gares où faut compter combien t'en as, les compagnies où ca dépend du dé...)
- toute la gestion de la prison (3 tours max, sortie par double ou paiement ou carte)
- les 20 cartes Chance et Caisse de Communauté avec tous leurs effets
- la construction des maisons/hotels avec la règle de construction équitable que j'ai galéré à comprendre (on peut pas mettre 2 maisons sur une propriété si une autre du groupe a 0 maison)
- le GameController et le TurnManager (la machine à états)
- toute l'IA (ai-controller + ai-strategy)
- **TOUS les tests unitaires** (plus de 100, ca m'a pris un temps fou mais c'est grâce à ça qu'on a trouvé plein de bugs '-')
- le EventBus avec les types TypeScript stricts

**Ce qui m'a posé problème** :

**1) La synchronisation animations / règles**. Au début je faisais tout de manière synchrone : le joueur lance les dés, la position change, on résout la case. Résultat : le pion n'avait même pas bougé à l'écran et on lui demandait déjà d'acheter la propriété. C'était hooooorrible. Naim m'a aidé sur cette partie, on a mis en place un système avec les événements `dice:animation:complete` et `pawn:animation:complete` pour attendre la fin des anims avant de continuer. Ca a demandé de casser tout mon code existant pour le rendre asynchrone.

**2) La faillite**. J'avais pas vu dans les règles officielles que quand un joueur fait faillite envers un autre joueur, il doit transférer ses propriétés ET ses cartes "Sortez de prison". Et si c'est envers la banque, les propriétés redeviennent achetables. J'ai refait cette partie 3 fois avant que ca soit correct (fonction `transferBankruptAssets`).

**3) Les règles de construction équitable**. En fait il faut que dans un groupe de couleur, les maisons soient réparties équitablement (écart max de 1). L'IA construisait n'importe comment au début. J'ai rajouté une vérification `minInGroup` dans `canBuild` et mes tests ont validé ca.

**Pourquoi Monopoly ?** 

Franchement avec Naim on a hésité avec d'autres idées (un puissance 4 en 3D, un tetris...) mais le Monopoly avait l'avantage d'avoir des règles qu'on connaissait déjà, un plateau iconique en 3D, et surtout ca nous permettait de faire une IA intéressante. Le puissance 4 c'est joli mais niveau gameplay y'a pas grand chose à coder.

---

### Naim Harib - 50%

De mon côté j'ai pris en charge toute la partie rendu 3D et interface utilisateur. Pour être honnête, c'est Babylon.js qui m'a attiré dans ce projet, comme chaque année, j'avais envie de faire quelque chose de visuellement soigné, pas juste fonctionnel.

**Ce que j'ai fait :**

- **Scene Manager** : setup moteur, scène, render loop
- **Board Mesh Builder** + **Board Texture Generator** : la texture 2048×2048 du plateau générée en Canvas 2D (avec le fameux bug du miroir des UV qui m'a fait perdre 3 heures)
- **Pawn Factory** + **Pawn Controller** : les 4 pions procéduraux (chapeau, fer, voiture, dé) et leurs animations de saut
- **Dice Renderer** : toute la simulation physique des dés (gravité, rebonds, friction, snap final sur la bonne face)
- **Camera Controller** : caméra cinématique avec transitions douces (lerp frame-par-frame), zoom automatique sur les cases, ghost highlight pour l'achat
- **Lighting Setup** : éclairage 3 points (sun + hemispheric + point light sur la case active) avec ombres PCF Soft
- **Post-Processing** : pipeline SSAO2 + Bloom + Tonemapping ACES + FXAA
- **Building Manager** : placement des maisons/hôtels avec InstancedMesh pour les perfs
- Toute la **UI DOM** : HUD, ActionPanel, Notifications, PropertyPanel, GameEndScreen
- **HoverCard3D** : la carte Monopoly 3D qui apparaît quand on survole sa case (ma fierté du projet)
- **AudioManager** : tous les sons procéduraux en Web Audio (aucun fichier .mp3)
- Config Vite, ESLint, Prettier, GitHub Actions CI
- Intégration finale dans `main.ts`

**Les difficultés :**

**1) Les valeurs des dés**. Le bug le plus malveillance max du projet. Les dés tombaient, s'arrêtaient bien, mais affichaient systématiquement la mauvaise face (genre on voulait un 6 et on voyait un 1). J'ai mis deux jours à comprendre : ma fonction `quatFromUnitVectors` avait un cas anti-parallèle complètement faux, j'utilisais `Quaternion.FromEulerAngles` en passant les composantes x/y/z du vecteur perpendiculaire comme si c'étaient des angles. Mathématiquement absurde. La correction : `Quaternion.RotationAxis(perp, Math.PI)`. Depuis, les dés affichent la bonne valeur à chaque fois.

**2) Le miroir de la texture du plateau**. J'ai généré une belle texture 2048×2048 avec les noms, les prix, les couleurs, et à l'affichage... tout le texte était en miroir horizontal. C'est lié au mapping UV de la face +Y du CreateBox de Babylon, U va de +X vers -X, donc dans l'autre sens que Canvas 2D. Solution : appliquer `ctx.scale(-1, 1)` au tout début du dessin pour compenser. Un `translate` + `scale` et tout était corrigé.

**3) La HoverCard3D**. Au départ la pick zone se déplaçait dès que l'état du jeu changeait (event `pawn:moved`). Mais le pion, lui, met plusieurs centaines de millisecondes à arriver. Résultat : on voyait la carte de la case de destination alors que le pion était encore en train de marcher. J'ai mis en place un `scheduleSyncAfterDelay` basé sur le nombre d'étapes × 320ms pour caler ça avec l'animation du pion.

**4) Les performances**. Au début j'avais 40 meshes séparés pour les 40 cases du plateau → 40+ draw calls. J'ai tout refait avec un seul mesh texturé → 1 draw call. Gain énorme sur mobile.

**Choix du projet :**

Avec Salima on voulait un projet où on pouvait à la fois bosser les règles (elle adore les jeux de logiques ;D) et la 3D (moi j'aime le visuel). Le Monopoly collait parfaitement. En plus, c'est un jeu qui impressionne visuellement quand on le fait en 3D, contrairement à un Puissance 4 par exemple où la 3D n'apporte pas grand chose au gameplay.

**Travail en binôme :**

Ca s'est super bien passé. On a bien découpé le projet dès le début (elle côté logique, moi côté rendu/UI) et l'EventBus typé nous a sauvés, on a pu bosser en parallèle sans se marcher dessus. Les intégrations finales ont été rapides parce que les contrats (événements + types) étaient clairs dès le départ.

---

## Licence

Projet académique — Université Côte d'Azur — Games on the Web 2026.
