// Запускается install.ps1'ом через bundled Cursor node.exe.
// Читает state.vscdb и пишет composers.js (ES module) в директорию пэтча.
// Используется кост-фичей в chat-labels.js.
//
// Что забираем:
//   - composer.composerHeaders → массив {composerId, name, lastUpdatedAt, createdAt}
//   - applicationUser.aiSettings.teamIds[0] → teamId (нужен в body API запроса)
//   - applicationUser.membershipType / isEnterprise → для дебага и информативного сообщения
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
    console.error('[composers] usage: node extract-composers.cjs <state.vscdb> <out.js>');
    process.exit(2);
}

function getValue(db, key) {
    return new Promise((resolve, reject) => {
        db.get(
            "SELECT CAST(value AS TEXT) AS v FROM ItemTable WHERE key = ?",
            [key],
            (err, row) => err ? reject(err) : resolve(row ? row.v : null)
        );
    });
}

(async () => {
    const db = await new Promise((resolve, reject) => {
        const d = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => err ? reject(err) : resolve(d));
    }).catch(e => { console.error('[composers] open:', e.message); process.exit(1); });

    // 1. composer.composerHeaders → trimmed composers
    const rawHeaders = await getValue(db, 'composer.composerHeaders').catch(() => null);
    if (!rawHeaders) { console.error('[composers] no composer.composerHeaders'); process.exit(1); }
    let headers;
    try { headers = JSON.parse(rawHeaders); }
    catch (e) { console.error('[composers] parse headers:', e.message); process.exit(1); }
    const list = headers.allComposers || headers.composers || [];
    const trimmed = list
        .filter(c => c && c.composerId)
        .map(c => ({
            composerId: c.composerId,
            name: (c.name || '').trim(),
            lastUpdatedAt: c.lastUpdatedAt || 0,
            createdAt: c.createdAt || 0
        }));

    // 2. applicationUser → teamId, membershipType, isEnterprise, dashboardUserId
    let teamId = null;
    let membershipType = null;
    let isEnterprise = null;
    let dashboardUserId = null;
    const rawUser = await getValue(
        db,
        'src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser'
    ).catch(() => null);
    if (rawUser) {
        try {
            const u = JSON.parse(rawUser);
            const teamIds = (u.aiSettings && Array.isArray(u.aiSettings.teamIds)) ? u.aiSettings.teamIds : [];
            if (teamIds.length > 0 && typeof teamIds[0] === 'number' && teamIds[0] > 0) {
                teamId = teamIds[0];
            }
            membershipType = u.membershipType || null;
            isEnterprise = (typeof u.isEnterprise === 'boolean') ? u.isEnterprise : null;
            if (u.dashboardUserId) dashboardUserId = u.dashboardUserId;
        } catch (e) {
            console.error('[composers] parse applicationUser:', e.message);
        }
    }

    const out =
        'export const composers = ' + JSON.stringify(trimmed) + ';\n' +
        'export const syncedAt = ' + Date.now() + ';\n' +
        'export const teamId = ' + JSON.stringify(teamId) + ';\n' +
        'export const membershipType = ' + JSON.stringify(membershipType) + ';\n' +
        'export const isEnterprise = ' + JSON.stringify(isEnterprise) + ';\n' +
        'export const dashboardUserId = ' + JSON.stringify(dashboardUserId) + ';\n';
    fs.writeFileSync(outPath, out, 'utf8');
    console.log('[composers] exported', trimmed.length, 'entries, teamId =', teamId, 'membershipType =', membershipType);
    process.exit(0);
})();
