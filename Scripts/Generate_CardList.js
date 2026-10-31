#!/usr/bin/env node
/**
 * Génère NeverriftCards.json (liste de cartes TCG Arena) à partir des fichiers Sets/*.json (base de cartes Neverrift).
 *
 *  - Format TCG Arena, comme les autres jeux : id, face.front, name, type, cost, rarity, faction, effects,
 *    top / left / bottom / right (valeurs d'attaque des créatures), set
 *  - Une carte TCG Arena par illustration : les versions alternatives (Alt, BW, 1st Edition, Box Topper…) ont le
 *    même nom → TCG Arena les regroupe en skins de la même carte
 *  - id    = nom du fichier image sans la langue ("alpha_NVR-EN001_1.webp" → "alpha_NVR001_1") : unique, stable,
 *            et identique quand une carte passe de l'allemand à l'anglais
 *  - image = lien direct du .json (aucun téléchargement)
 *  - Anglais en priorité. Une carte sans version anglaise (ex : Otter's Den, encore "coming soon") est prise en
 *    allemand ; elle passera en anglais toute seule quand les données anglaises arriveront (même id)
 *  - Une même image dans plusieurs fichiers (ex : boardgame reprend les cartes Alpha) n'est gardée qu'une fois
 *  - Une carte qui disparaît des fichiers est conservée telle quelle (aucune carte perdue pour les decks existants)
 *  - Rapport dans Scripts/cardlist-report.md
 *
 * Emplacement : Scripts/Generate_CardList.js (les chemins partent de la racine du repo, les sets sont dans Sets/)
 * Usage       : node Scripts/Generate_CardList.js      (FORCE=1 pour écrire même si beaucoup de cartes manquent)
 * Dépendances : aucune (Node 18+)
 */
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// ─────────────────────────────── Configuration ───────────────────────────────

const CONFIG = {
    repoRoot: path.resolve(process.env.REPO_ROOT || path.join(__dirname, '..')),
    setsDir: 'Sets',                          // un .json par set, à la racine du repo
    cardsFile: 'NeverriftCards.json',         // fichier du jeu, à la racine du repo
    reportPath: path.join(__dirname, 'cardlist-report.md'),
    minRatioVsPrevious: 0.8,                  // refuse d'écrire si on perd >20% des cartes (FORCE=1 pour forcer)
};

/**
 * Fichiers de Sets/ : ordre de lecture (= ordre dans NeverriftCards.json, et priorité quand une même image est dans
 * plusieurs fichiers) et nom du set affiché. Un fichier absent de cette liste est lu à la fin, avec son nom de
 * fichier en majuscules comme nom de set (signalé dans le rapport).
 */
const SETS = [
    ['alpha', 'Alpha'],
    ['1st', '1st Edition'],
    ['sotr', 'Siege of the Riftborn'],
    ['anre', 'Ancient Relics'],
    ['otdn', "Otter's Den"],
    ['ecb', 'ECB'],
    ['boxtopper', 'Box Topper'],
    ['promo', 'Promo'],
    ['vip', 'VIP'],
    ['boardgame', 'Board Game Starter Kit'],
];

const TYPES = { creature: 'Creature', spell: 'Spell', place: 'Place', tamer: 'Tamer' };
// Effets dont le nom affiché n'est pas simplement le mot en majuscule
const EFFECT_NAMES = {
    oncast: 'On Cast',
    destroy_place: 'Destroy Place',
    tameprotect: 'Tame Protect',
    gravedigging: 'Grave Digging',
};
const SIDES = ['top', 'left', 'bottom', 'right'];

// ─────────────────────────────── Rapport d'erreurs ───────────────────────────────

const issues = [];
function report(level, category, id, message) { issues.push({ level, category, id: String(id), message: message || '' }); }

class FatalError extends Error { }

// ─────────────────────────────── Utilitaires ───────────────────────────────

function rel(...p) { return path.join(CONFIG.repoRoot, ...p); }
function clean(s) { return String(s ?? '').replace(/\s+/g, ' ').trim(); }
function titleCase(s) { return clean(String(s).replace(/_/g, ' ')).replace(/\b\p{L}/gu, ch => ch.toUpperCase()); }
function images(list) { return (Array.isArray(list) ? list : []).map(clean).filter(u => /^https?:\/\//i.test(u)); }

async function readJsonIfExists(file, fallback) {
    try {
        return JSON.parse(await fsp.readFile(file, 'utf8'));
    } catch (e) {
        if (e.code !== 'ENOENT') report('warning', 'Fichiers locaux illisibles (ignorés)', path.relative(CONFIG.repoRoot, file), e.message);
        return fallback;
    }
}

async function writeFileAtomic(file, content) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file + '.tmp', content);
    await fsp.rename(file + '.tmp', file);
}

/** "https://…/files/alpha_NVR-EN001_1.webp" → "alpha_NVR001_1" (sans la langue, pour garder le même id en EN et en DE) */
function imageId(url) {
    let file;
    try { file = decodeURIComponent(new URL(url).pathname.split('/').pop()); } catch { file = String(url).split('/').pop(); }
    return file.replace(/\.[a-z0-9]+$/i, '').replace(/-(EN|DE)(?=[\s_\d])/gi, '').replace(/\s+/g, '');
}

/** Numéro de la carte pour le tri : "NVR-EN 033" → 33, "PR-EN0001" → 1, "NVR-EN 151/150" → 151 */
function cardNumber(c) {
    const m = clean(c.id_en || c.id_de).match(/-(?:EN|DE)\s*0*(\d+)/i) || clean(c.id_en || c.id_de).match(/(\d+)/);
    return m ? Number(m[1]) : 9999;
}

// ─────────────────────────────── Format NeverriftCards.json ───────────────────────────────

function buildCardEntry(c, { id, name, image, setName }) {
    const type = TYPES[clean(c.type).toLowerCase()] || titleCase(c.type) || 'Unknown';
    const entry = {
        id,
        face: {
            front: { name, type, cost: 0, image, isHorizontal: false },
        },
        name,
        type,
        cost: 0,
        rarity: titleCase(c.rarity) || undefined,
        faction: clean(c.faction) || undefined,
        effects: (c.effects || []).map(e => EFFECT_NAMES[e] || titleCase(e)).filter(Boolean),
    };
    // valeurs d'attaque (créatures) : nombre, ou "A" tel quel
    for (const side of SIDES) {
        const v = c[side];
        if (v === '' || v == null) continue;
        entry[side] = /^-?\d+$/.test(String(v)) ? Number(v) : String(v);
    }
    entry.set = setName;
    return JSON.parse(JSON.stringify(entry)); // retire les champs undefined
}

// ─────────────────────────────── Rapport ───────────────────────────────

function buildReport(summary) {
    const errors = issues.filter(i => i.level === 'error');
    const warnings = issues.filter(i => i.level === 'warning');
    const lines = [];
    lines.push(`# Liste des cartes Neverrift — ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`, '');
    lines.push('| | |', '|---|---|');
    for (const s of summary.sets) lines.push(`| ${CONFIG.setsDir}/${s.file} (${s.name}) | ${s.error ? '❌ ' + s.error : `${s.entries} entrées → ${s.cards} cartes${s.duplicates ? `, ${s.duplicates} doublons ignorés` : ''}${s.german ? `, ${s.german} en allemand` : ''}`} |`);
    lines.push(`| Cartes dans ${CONFIG.cardsFile} | ${summary.cardCount} (avant : ${summary.previousCount}) |`);
    lines.push(`| Noms différents (cartes jouables) | ${summary.nameCount} |`);
    lines.push(`| Nouvelles cartes | ${summary.added.length} |`);
    lines.push(`| Cartes disparues des fichiers (conservées) | ${summary.kept.length} |`);
    lines.push(`| ❌ Erreurs | ${errors.length} |`);
    lines.push(`| ⚠️ Avertissements | ${warnings.length} |`, '');

    if (summary.fatal) lines.push('## 💥 Erreur bloquante', '', summary.fatal, '', `${CONFIG.cardsFile} n'a PAS été modifié.`, '');

    const section = (title, list) => {
        if (!list.length) return;
        lines.push(`## ${title} (${list.length})`, '');
        const byCat = new Map();
        for (const i of list) byCat.set(i.category, [...(byCat.get(i.category) || []), i]);
        for (const [cat, items] of byCat) {
            lines.push(`### ${cat} — ${items.length}`, '');
            items.slice(0, 300).forEach(i => lines.push(`- \`${i.id}\`${i.message ? ' — ' + i.message : ''}`));
            if (items.length > 300) lines.push(`- … et ${items.length - 300} autre(s)`);
            lines.push('');
        }
    };
    section('❌ Erreurs', errors);
    section('⚠️ Avertissements', warnings);

    if (summary.added.length && summary.previousCount) {
        lines.push(`## ➕ Nouvelles cartes (${summary.added.length})`, '');
        summary.added.forEach(e => lines.push(`- \`${e.id}\` ${e.name} (${e.set})`));
        lines.push('');
    }
    return lines.join('\n');
}

async function writeReport(summary) {
    const md = buildReport(summary);
    await writeFileAtomic(CONFIG.reportPath, md);
    if (process.env.GITHUB_STEP_SUMMARY) {
        const limited = md.length > 900_000 ? md.slice(0, 900_000) + '\n\n_(tronqué, voir Scripts/cardlist-report.md)_' : md;
        await fsp.appendFile(process.env.GITHUB_STEP_SUMMARY, limited + '\n');
    }
    if (process.env.GITHUB_OUTPUT) {
        const nErr = issues.filter(i => i.level === 'error').length;
        const nWarn = issues.filter(i => i.level === 'warning').length;
        await fsp.appendFile(process.env.GITHUB_OUTPUT, `errors=${nErr}\nwarnings=${nWarn}\n`);
    }
}

function printIssuesToConsole() {
    const print = (icon, list) => {
        const byCat = new Map();
        list.forEach(i => byCat.set(i.category, [...(byCat.get(i.category) || []), i]));
        for (const [cat, items] of byCat) {
            console.log(`\n${icon} ${cat} (${items.length})`);
            items.slice(0, 30).forEach(i => console.log(`   - ${i.id}${i.message ? ' : ' + i.message : ''}`));
            if (items.length > 30) console.log(`   … et ${items.length - 30} autre(s), voir le rapport`);
        }
    };
    const errors = issues.filter(i => i.level === 'error');
    const warnings = issues.filter(i => i.level === 'warning');
    if (errors.length) { console.log(`\n════════ ❌ ${errors.length} ERREUR(S) ════════`); print('❌', errors); }
    if (warnings.length) { console.log(`\n════════ ⚠️  ${warnings.length} AVERTISSEMENT(S) ════════`); print('⚠️ ', warnings); }
    if (!errors.length && !warnings.length) console.log('\n✨ Aucune erreur, aucun avertissement.');
}

// ─────────────────────────────── Main ───────────────────────────────

async function main() {
    const summary = { sets: [], cardCount: 0, previousCount: 0, nameCount: 0, added: [], kept: [], fatal: null };

    try {
        // ── 1. Fichiers de sets ──
        const setsPath = rel(CONFIG.setsDir);
        if (!fs.existsSync(setsPath)) throw new FatalError(`Dossier ${CONFIG.setsDir}/ introuvable à la racine du repo`);
        const files = fs.readdirSync(setsPath).filter(f => f.toLowerCase().endsWith('.json'));
        if (!files.length) throw new FatalError(`Aucun fichier .json dans ${CONFIG.setsDir}/`);
        const known = new Map(SETS.map(([key, name], i) => [key, { name, order: i }]));
        const setFiles = files
            .map(file => {
                const key = file.replace(/\.json$/i, '').toLowerCase();
                const info = known.get(key);
                if (!info) report('warning', 'Fichiers de sets absents de SETS (ajoute-les avec leur nom)', file, `nom de set utilisé : "${key.toUpperCase()}"`);
                return { file, key, name: info?.name ?? key.toUpperCase(), order: info?.order ?? SETS.length };
            })
            .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
        for (const [key] of SETS) {
            if (!setFiles.some(s => s.key === key)) report('warning', 'Sets attendus mais absents du dossier', `${key}.json`, '');
        }

        const cardsPath = rel(CONFIG.cardsFile);
        const previousCards = await readJsonIfExists(cardsPath, {});
        summary.previousCount = Object.keys(previousCards).length;

        // ── 2. Construction des cartes (une par illustration) ──
        const out = {};
        const firstSetOf = {};   // id → set où l'image a été vue en premier
        const built = [];        // { entry, order, number, alt }
        for (const s of setFiles) {
            const stat = { file: s.file, name: s.name, entries: 0, cards: 0, duplicates: 0, german: 0 };
            summary.sets.push(stat);
            let data;
            try {
                data = JSON.parse(await fsp.readFile(path.join(setsPath, s.file), 'utf8'));
            } catch (e) {
                stat.error = `illisible (${e.message})`;
                report('error', 'Fichiers de sets illisibles (leurs cartes déjà connues sont conservées)', s.file, e.message);
                continue;
            }
            if (!Array.isArray(data)) {
                stat.error = 'le fichier ne contient pas une liste de cartes';
                report('error', 'Fichiers de sets illisibles (leurs cartes déjà connues sont conservées)', s.file, stat.error);
                continue;
            }
            stat.entries = data.length;
            const duplicatesFrom = {};
            for (const c of data) {
                if (!c || typeof c !== 'object') continue;
                const ref = clean(c.id_en) || clean(c.id_de) || '?';
                const en = images(c.images_en);
                const de = images(c.images_de);
                const name = clean(c.name_en) || clean(c.name_de);
                const pics = clean(c.name_en) ? (en.length ? en : de) : (de.length ? de : en);
                if (!name) { report('error', 'Cartes sans nom (ignorées)', `${s.file} ${ref}`, ''); continue; }
                if (!pics.length) { report('warning', 'Cartes sans image (ignorées)', `${s.file} ${ref}`, name); continue; }
                if (!clean(c.name_en)) stat.german++;
                else if (!en.length) report('warning', 'Cartes avec nom anglais mais image allemande seulement', `${s.file} ${ref}`, name);
                if (/\{[^}]*\}/.test(clean(c.id_en))) report('warning', 'Identifiants mal remplis dans les données (sans effet sur la carte)', `${s.file} ${c.id_en}`, name);

                pics.forEach((image, alt) => {
                    const id = imageId(image);
                    if (out[id]) {
                        if (firstSetOf[id] !== s.key) duplicatesFrom[firstSetOf[id]] = (duplicatesFrom[firstSetOf[id]] || 0) + 1;
                        else report('warning', 'Même image deux fois dans un fichier (gardée une fois)', `${s.file} ${ref}`, `${name} — ${image}`);
                        stat.duplicates++;
                        return;
                    }
                    const entry = buildCardEntry(c, { id, name, image, setName: s.name });
                    out[id] = entry;
                    firstSetOf[id] = s.key;
                    built.push({ id, order: s.order, key: s.key, number: cardNumber(c), alt });
                    stat.cards++;
                });
            }
            if (stat.german) report('warning', 'Cartes sans version anglaise (prises en allemand)', s.file, `${stat.german} carte(s)`);
            for (const [from, n] of Object.entries(duplicatesFrom)) {
                report('warning', 'Images déjà présentes dans un autre fichier (doublons ignorés)', s.file, `${n} déjà dans ${from}.json`);
            }
        }

        const realIds = Object.keys(out);
        if (!realIds.length) throw new FatalError('Aucune carte lue dans les fichiers de sets');
        if (summary.previousCount && realIds.length < summary.previousCount * CONFIG.minRatioVsPrevious && process.env.FORCE !== '1') {
            throw new FatalError(`Seulement ${realIds.length} cartes contre ${summary.previousCount} dans le ${CONFIG.cardsFile} actuel. ` +
                'Relancer avec FORCE=1 pour écraser quand même.');
        }

        // ── 3. Comparaison avec l'ancienne liste ──
        summary.added = realIds.filter(id => !(id in previousCards)).map(id => out[id]);
        const keptIds = [];
        for (const [id, prev] of Object.entries(previousCards)) {
            if (out[id]) continue;
            out[id] = prev; // aucune carte perdue pour les decks existants
            keptIds.push(id);
            report('warning', 'Cartes disparues des fichiers de sets (conservées telles quelles)', id, prev?.name || '');
        }
        summary.kept = keptIds;

        // ── 4. Écriture (triée par set, numéro de carte, puis versions alternatives) ──
        built.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key) || a.number - b.number || a.alt - b.alt || a.id.localeCompare(b.id));
        const sorted = [...built.map(b => b.id), ...keptIds];
        await writeFileAtomic(cardsPath, JSON.stringify(Object.fromEntries(sorted.map(k => [k, out[k]])), null, 2) + '\n');
        summary.cardCount = sorted.length;
        summary.nameCount = new Set(Object.values(out).map(e => e.name)).size;

        console.log(`💾 ${CONFIG.cardsFile} écrit : ${summary.cardCount} cartes, ${summary.nameCount} noms différents ` +
            `(${summary.added.length} nouvelles, ${summary.kept.length} disparues des fichiers conservées)`);
        for (const s of summary.sets) {
            console.log(`   ${s.file.padEnd(16)} ${s.error ? '❌ ' + s.error : `${String(s.entries).padStart(4)} entrées → ${String(s.cards).padStart(4)} cartes` +
                `${s.duplicates ? `, ${s.duplicates} doublons` : ''}${s.german ? `, ${s.german} en allemand` : ''}`}`);
        }
    } catch (e) {
        summary.fatal = e instanceof FatalError ? e.message : `Erreur inattendue : ${e.stack || e.message}`;
        console.error(`\n💥 ${summary.fatal}`);
    }

    if (!summary.fatal || issues.length) printIssuesToConsole();
    await writeReport(summary).catch(e => console.error('Impossible d\'écrire le rapport :', e.message));
    console.log(`\n📄 Rapport : ${path.relative(CONFIG.repoRoot, CONFIG.reportPath)}`);
    if (summary.fatal) process.exitCode = 1;
}

main();
