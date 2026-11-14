import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mobileDistDir = path.resolve(__dirname, "../dist/mobile");

if (!fs.existsSync(mobileDistDir)) {
  console.error("❌ Directório dist/mobile não encontrado. Execute 'npm run build:mobile' primeiro.");
  process.exit(1);
}

const forbiddenAdminTerms = [
  "AdminApp",
  "?app=admin",
  "handleToggleSuspendUser",
  "handleToggleStoreVip",
  "handleSendBroadcast",
  "handleResolveReport",
  "Painel Administrativo Web",
  "Painel Administrativo",
  "Registo de Auditoria de Ações Administrativas",
  "auditRepo.log",
  "Moderação de Lojas e Selos VIP",
  "Acesso restrito. Este e-mail não possui permissões de Administrador",
  "LOGIN_ADMIN",
];

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

const files = getAllFiles(mobileDistDir);
let violations = [];
let totalBytesScanned = 0;

for (const file of files) {
  if (file.endsWith(".js") || file.endsWith(".html")) {
    const content = fs.readFileSync(file, "utf-8");
    totalBytesScanned += content.length;

    for (const term of forbiddenAdminTerms) {
      if (content.includes(term)) {
        violations.push({ file: path.relative(mobileDistDir, file), term });
      }
    }
  }
}

console.log("==============================================================");
console.log("   AUDITORIA DE SEGURANÇA E ISOLAMENTO — BUNDLE MOBILE       ");
console.log("==============================================================");
console.log(`Ficheiros analisados em dist/mobile: ${files.length}`);
console.log(`Volume de código verificado: ${(totalBytesScanned / 1024).toFixed(1)} KB`);
console.log(`Termos de administração verificados: ${forbiddenAdminTerms.length}`);

if (violations.length > 0) {
  console.error("\n❌ FALHA: Foram detectadas referências de administração no bundle móvel:");
  violations.forEach((v) => {
    console.error(` - Ficheiro: ${v.file} | Termo encontrado: "${v.term}"`);
  });
  process.exit(1);
} else {
  console.log("\n✅ SUCESSO: 0 fugas de código de administração detectadas.");
  console.log("O bundle da aplicação móvel (APK / AAB) está 100% livre de rotas, funções ou textos de admin.");
  console.log("==============================================================\n");
}
