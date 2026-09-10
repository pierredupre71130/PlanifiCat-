# PlanifiCat 🐾

Petite application web pour calculer des horaires d'injection d'insuline
(2 injections/jour) qui restent le plus proche possible de 12h d'écart,
malgré des horaires de travail irréguliers.

## Principe

Pour chaque jour, tu renseignes tes créneaux d'absence (travail,
rendez-vous...). L'application calcule ensuite, sur toute la période
saisie, les 2 horaires d'injection par jour qui minimisent l'écart à 12h
tout en évitant ces créneaux (avec une marge de sécurité configurable).

Le calcul ne se fait pas jour par jour indépendamment : il optimise sur
l'ensemble de la période saisie, pour anticiper. Par exemple, un jour sans
contrainte peut voir son horaire décalé à l'avance si le lendemain impose
un horaire précis, afin de rester dans la tolérance (11h-13h par défaut)
à chaque transition.

⚠️ **Ceci est un outil d'aide au calcul.** La fréquence des injections,
l'écart toléré et la marge de décalage doivent rester ceux validés par
l'équipe médicale qui suit le traitement — ils sont réglables dans
l'application mais ne remplacent pas cet avis.

## Utilisation

Aucune installation nécessaire : c'est un site statique (HTML/CSS/JS pur,
sans backend). Par défaut, toutes les données restent sur l'appareil
(stockées dans le `localStorage` du navigateur) — rien n'est envoyé sur un
serveur. La synchronisation GitHub (optionnelle, voir plus bas) permet de
ne pas dépendre uniquement de ce stockage local.

- **En local** : ouvrir `index.html` dans un navigateur, ou lancer un petit
  serveur (`python3 -m http.server` puis `http://localhost:8000`).
- **Hébergement en ligne (GitHub Pages)** : Paramètres du dépôt → Pages →
  Deploy from branch → choisir la branche et le dossier racine (`/`).
  L'application devient accessible via l'URL fournie par GitHub Pages.
- Sur téléphone, une fois le site ouvert, utiliser « Ajouter à l'écran
  d'accueil » pour l'installer comme une app (fonctionne aussi hors ligne
  grâce au service worker).

## Réglages disponibles

- **Tolérance** autour de 12h (par défaut ± 60 min, soit 11h-13h).
- **Marge de sécurité** autour de chaque absence (par défaut 5 min).
- **Horaire de référence** utilisé quand aucune contrainte ne s'applique.
- **Point de départ** (optionnel) : dernière injection connue avant le
  premier jour saisi, pour ancrer le calcul sur un historique réel.

Les données peuvent être exportées/importées en JSON (bouton dans les
réglages) pour faire une sauvegarde ou changer d'appareil.

## Synchronisation GitHub (sauvegarde hors du navigateur)

Le `localStorage` du navigateur a un défaut : il est propre à un seul
appareil et un seul navigateur, et peut être perdu (données du navigateur
effacées, changement de téléphone...). La synchronisation GitHub sauvegarde
les données sur un dépôt GitHub, en plus du stockage local.

**Principe de sécurité** : les données ne doivent surtout pas passer par le
dépôt de code (`PlanifiCat-`), car un site publié avec GitHub Pages reste
consultable publiquement même si le dépôt est privé (sur un compte
gratuit). On utilise donc un **second dépôt, privé, dédié aux données
uniquement**, jamais publié via Pages, accessible seulement via l'API
GitHub avec un token restreint. Le token n'est jamais inclus dans les
données elles-mêmes ni dans l'export JSON.

### Mise en place (à faire une seule fois, par le propriétaire du compte GitHub)

1. **Créer le dépôt privé de données**
   - Sur GitHub : `New repository` → nom au choix (ex. `planificat-data`) →
     cocher **Private** → créer.
2. **Créer un token d'accès restreint à ce seul dépôt**
   - GitHub → photo de profil → **Settings** → **Developer settings** →
     **Personal access tokens** → **Fine-grained tokens** → **Generate new
     token**.
   - *Resource owner* : ton compte.
   - *Repository access* : **Only select repositories** → choisir
     uniquement le dépôt créé à l'étape 1 (surtout pas `PlanifiCat-`).
   - *Permissions* → **Repository permissions** → **Contents** :
     **Read and write**. Laisser tout le reste sans accès.
   - Choisir une date d'expiration, générer, puis **copier le token**
     (`github_pat_...`) — il ne sera plus affiché ensuite.
3. **Configurer l'application**
   - Dans l'app → ⚙️ Réglages → section *Synchronisation GitHub* :
     - *Propriétaire du dépôt* : ton nom d'utilisateur GitHub.
     - *Nom du dépôt privé de données* : le nom choisi à l'étape 1.
     - *Token d'accès* : coller le token copié à l'étape 2.
   - Cliquer sur **Synchroniser maintenant** une première fois.

Ensuite, la synchronisation se fait automatiquement en arrière-plan
(quelques secondes après chaque modification), sans action supplémentaire.
Le bouton « Synchroniser maintenant » reste disponible pour forcer une
synchro immédiate (par exemple juste avant de changer d'appareil).

**Pour que ta collègue l'utilise sans avoir de compte GitHub** : c'est le
propriétaire du dépôt (toi) qui fait les 2 premières étapes ci-dessus, puis
qui lui transmet uniquement le token à coller dans ses réglages — elle n'a
besoin de rien créer elle-même côté GitHub.

**Portée du risque si le token fuit** : il ne donne accès en écriture qu'à
ce dépôt de données vide de tout code, rien d'autre sur le compte GitHub.
Il expire à la date choisie (à renouveler ensuite dans les réglages de
l'app). Si plusieurs appareils modifient les données en même temps sans
avoir synchronisé entre-temps, l'app détecte le conflit et demande quelle
version garder plutôt que d'écraser silencieusement.

## Fichiers

- `index.html`, `style.css`, `app.js` — interface.
- `scheduler.js` — moteur de calcul (programmation dynamique), indépendant
  de l'interface, testable seul (voir commentaires en tête du fichier).
- `manifest.json`, `icon.svg`, `service-worker.js` — support PWA
  (installation sur téléphone, usage hors ligne).
