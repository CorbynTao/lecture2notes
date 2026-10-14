import { mkdir, copyFile, cp } from "node:fs/promises";
import { resolve } from "node:path";
const base = resolve("node_modules/pdfjs-dist");
await mkdir("public/vendor", { recursive: true });
for (const name of ["pdf.mjs", "pdf.worker.mjs"]) await copyFile(resolve(base, "build", name), resolve("public/vendor", name));
await cp(resolve(base, "cmaps"), "public/vendor/cmaps", { recursive: true });
await cp(resolve(base, "standard_fonts"), "public/vendor/standard_fonts", { recursive: true });
await copyFile(resolve(base, "LICENSE"), "public/vendor/PDFJS-LICENSE.txt");
console.log("PDF.js browser assets ready.");
