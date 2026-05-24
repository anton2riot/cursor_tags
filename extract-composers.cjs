// Запускается install.ps1'ом через bundled Cursor node.exe.
// Читает composer.composerHeaders из state.vscdb и пишет composers.js (ES module)
// в директорию пэтча. Используется кост-фичей в chat-labels.js.
//
// @vscode/sqlite3 — нативный модуль из bundle Cursor'а. Резолвим его путь
// относительно node.exe Cursor'а, чтобы не полагаться на NODE_PATH
// (он не всегда наследуется между PowerShell-вызовами).
//   ...\resources\app\resources\helpers\node.exe
//   ...\resources\app\node_modules\@vscode\sqlite3
const path = require('path');
const fs = require('fs');
const cursorAppDir = path.resolve(path.dirname(process.execPath), '..', '..');
const sqlite3Path = path.join(cursorAppDir, 'node_modules', '@vscode', 'sqlite3');
const sqlite3 = require(sqlite3Path);

const dbPath = process.argv[2];
const outPath = process.argv[3];

if (!dbPath || !outPath) {
    console.error('[composers] usage: node extract-composers.js <state.vscdb> <out.js>');
    process.exit(2);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) { console.error('[composers] open:', err.message); process.exit(1); }
    db.get(
        "SELECT CAST(value AS TEXT) AS v FROM ItemTable WHERE key = 'composer.composerHeaders'",
        (err, row) => {
            if (err || !row) { console.error('[composers] no composer.composerHeaders row'); process.exit(1); }
            let parsed;
            try { parsed = JSON.parse(row.v); }
            catch (e) { console.error('[composers] parse:', e.message); process.exit(1); }

            const list = parsed.allComposers || parsed.composers || [];
            const trimmed = list
                .filter(c => c && c.composerId)
                .map(c => ({
                    composerId: c.composerId,
                    name: (c.name || '').trim(),
                    lastUpdatedAt: c.lastUpdatedAt || 0,
                    createdAt: c.createdAt || 0
                }));

            const out =
                'export const composers = ' + JSON.stringify(trimmed) + ';\n' +
                'export const syncedAt = ' + Date.now() + ';\n';
            fs.writeFileSync(outPath, out, 'utf8');
            console.log('[composers] exported', trimmed.length, 'entries to', outPath);
            process.exit(0);
        }
    );
});
