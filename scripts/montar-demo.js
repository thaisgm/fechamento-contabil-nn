// Monta a versão de demonstração (sem servidor) na pasta _site, para o GitHub Pages.
// Rodar com: npm run demo
const fs = require("node:fs");
const path = require("node:path");
const raiz = path.join(__dirname, "..");
const destino = path.join(raiz, "_site");
fs.rmSync(destino, { recursive: true, force: true });
for (const [de, para] of [["public", ""], ["shared", "shared"], ["data", "data"]]) {
  fs.cpSync(path.join(raiz, de), path.join(destino, para), { recursive: true });
}
fs.writeFileSync(path.join(destino, ".nojekyll"), "");
console.log("Demonstração montada em _site/");
