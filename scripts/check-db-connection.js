const fs = require("fs");
const path = require("path");

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function redact(value) {
  return String(value).replace(
    /(mongodb(?:\+srv)?:\/\/)([^:@/\s]+):([^@/\s]+)@/gi,
    "$1<user>:<password>@"
  );
}

async function main() {
  loadLocalEnv();

  const { getDb } = require("../api/_lib/db");
  const db = await getDb();
  const result = await db.command({ ping: 1 });

  console.log(
    JSON.stringify(
      {
        ok: true,
        dbName: db.databaseName,
        ping: result.ok,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        name: error.name,
        message: redact(error.message),
        code: error.code || null,
      },
      null,
      2
    )
  );
  process.exit(1);
});
