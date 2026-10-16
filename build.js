const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const output = path.join(root, "public");

fs.mkdirSync(path.join(output, "assets"), { recursive: true });
for (const file of ["index.html", "report.html"]) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
fs.cpSync(path.join(root, "assets"), path.join(output, "assets"), { recursive: true });
