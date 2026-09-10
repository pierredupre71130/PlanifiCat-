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
sans backend). Toutes les données restent sur l'appareil (stockées dans le
`localStorage` du navigateur) — rien n'est envoyé sur un serveur.

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

## Fichiers

- `index.html`, `style.css`, `app.js` — interface.
- `scheduler.js` — moteur de calcul (programmation dynamique), indépendant
  de l'interface, testable seul (voir commentaires en tête du fichier).
- `manifest.json`, `icon.svg`, `service-worker.js` — support PWA
  (installation sur téléphone, usage hors ligne).
