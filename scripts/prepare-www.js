// Copie les fichiers de l'appli web dans www/ (dossier lu par Capacitor).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const files = ['index.html', 'style.css', 'app.js', 'scheduler.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of files) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f));
}
console.log('www/ prêt :', fs.readdirSync(out).join(', '));
