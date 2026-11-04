# PlanifiCat sur Android (APK)

Le projet Android est déjà prêt dans le dossier `android/`. Il suffit de le compiler avec Android Studio.

## Créer l'APK (sur PC ou Mac)

1. Installer **Android Studio** (gratuit) : https://developer.android.com/studio
2. Installer **Node.js** (version LTS) : https://nodejs.org
3. Télécharger ce dépôt (bouton vert **Code → Download ZIP** sur GitHub, en choisissant la branche
   `claude/app-colleague-request-f6iebv`), puis le décompresser.
4. Ouvrir un terminal dans le dossier décompressé (la racine, celle qui contient `package.json`) et taper :
   `npm install` (une seule fois, télécharge la brique Capacitor nécessaire à la compilation).
5. Dans Android Studio : **Open** → choisir le dossier **`android`** (pas le dossier racine).
6. Attendre la fin du « Gradle sync » (barre de progression en bas, plusieurs minutes la première fois ; accepter d'installer les composants proposés).
7. Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
8. Une bulle « APK(s) generated » apparaît : cliquer sur **locate**. Le fichier est `app-debug.apk`
   (dans `android/app/build/outputs/apk/debug/`).

## Installer sur le téléphone

1. Envoyer `app-debug.apk` sur le téléphone (câble USB, Drive, mail).
2. L'ouvrir ; Android demande d'autoriser l'installation depuis cette source → accepter.
3. L'icône « PlanifiCat » (tête de chat) apparaît.

## Important

- **Les données de l'APK sont séparées de celles de l'appli web / Chrome.** Les transférer avec
  « Copier mes données » / « Charger les données collées » (Réglages) ou via la synchronisation GitHub.
- L'appli est **embarquée** dans l'APK : après une modification du code, il faut refaire
  `npm install` puis `npm run sync` (à la racine), puis recompiler l'APK.
- Pour que l'APK soit une version « publiable » (Google Play), il faut la signer
  (Build → Generate Signed Bundle / APK) et **conserver précieusement la clé**.
