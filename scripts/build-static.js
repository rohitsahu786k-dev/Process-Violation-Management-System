const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "public");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const fileName of ["index.html", "PVMS_Portal V4.html"]) {
  fs.copyFileSync(path.join(rootDir, fileName), path.join(outDir, fileName));
}

fs.cpSync(path.join(rootDir, "assests"), path.join(outDir, "assests"), {
  recursive: true,
});

console.log("Static files copied to public/");
