"use strict";
const fs = require("node:fs"), path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const runTests = require("./compatibility-tests.cjs");
const runMenuTests = require("./menu-tests.cjs");
const manifest = require("./asset-manifest.json");
const root = path.resolve(__dirname, "..");
const mods = path.join(root, "ProjectPBZ", "Content", "JavaScript", "PBZModsMenu", "Mods");
const studio = path.join(mods, "PBZSoulHairStudioMenu");
const atelier = path.join(mods, "ACAtelieSoulCor");
const gitExe = process.env.PBZ_GIT_EXE || "git";
const git = (...args) => execFileSync(gitExe, args, { cwd: root, encoding: "utf8", maxBuffer: 8*1024*1024 });
const requireCheck = (condition, message) => { if (!condition) throw new Error(message); };
const load = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");
async function hashFile(filename, algorithm, prefix) {
    const h = createHash(algorithm);
    if (prefix) h.update(prefix);
    for await (const chunk of fs.createReadStream(filename)) h.update(chunk);
    return h.digest("hex");
}
async function main() {
    let jsCount = 0;
    for (const dir of [studio, atelier]) {
        for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".js"))) {
            new Function("module", "exports", "require", load(dir, f));
            jsCount++;
        }
    }
    requireCheck(jsCount === 24, "Missing or unexpected runtime JS modules: " + jsCount);
    const checks = runTests({
        bridge: load(studio, "combined-compat.js"),
        hats: load(studio, "hats.js"),
        appearance: load(studio, "appearance.js"),
        catalog: load(studio, "catalog.js"),
        cosmetics: load(studio, "cosmetics.js"),
        paleta: load(atelier, "paleta.js"),
        roupas: load(atelier, "roupas.js")
    });
    const menus = runMenuTests({
        bridge: load(studio, "combined-compat.js"),
        studio: load(studio, "main.js"),
        ui: load(studio, "ui.js"),
        atelier: load(atelier, "guarda_roupa.js")
    });
    requireCheck(checks.length === 41 && menus.length === 33, "Unexpected compatibility test count");
    console.log("Runtime JS parsed:", jsCount, "| appearance mock checks:", checks.length, "| menu lifecycle mock checks:", menus.length);
    requireCheck(!fs.existsSync(path.join(root, "ProjectPBZ", "PBZModLoader", "mods", "PBZSoulHairStudio")), "Duplicate Studio loader edition detected");
    requireCheck(manifest.assets.length === manifest.assetCount && manifest.assetCount === 72, "Incorrect asset count");
    const tree = new Map(git("ls-tree", "-r", "HEAD").trim().split(/\r?\n/).map(line => {
        const tab = line.indexOf("\t"), meta = line.slice(0, tab).split(" ");
        return [line.slice(tab+1), meta[2]];
    }));
    const groups = new Map(), pointers = new Map(), assetPaths = new Set();
    let bytes=0, lfsCount=0;
    for (const asset of manifest.assets) {
        const file = path.join(root, ...asset.path.split("/"));
        requireCheck(!assetPaths.has(asset.path), "Duplicate manifest path: " + asset.path);
        assetPaths.add(asset.path);
        requireCheck(tree.get(asset.path) === asset.gitBlob, "Wrong committed Git blob: " + asset.path);
        requireCheck(fs.existsSync(file) && fs.statSync(file).isFile(), "Missing asset: " + asset.path);
        const size = fs.statSync(file).size;
        const ext = path.extname(file), stem = asset.path.slice(0, -ext.length);
        if (!groups.has(stem)) groups.set(stem, new Set());
        groups.get(stem).add(ext);
        if (asset.storage === "lfs") {
            let pointer = pointers.get(asset.gitBlob);
            if (!pointer) {
                const content = git("cat-file", "blob", asset.gitBlob);
                const match = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([0-9a-f]{64})\r?\nsize ([0-9]+)\r?\n?$/.exec(content);
                requireCheck(match, "Invalid LFS pointer: " + asset.path);
                pointer = { oid: match[1], size: Number(match[2]) };
                pointers.set(asset.gitBlob, pointer);
            }
            requireCheck(size === pointer.size, "Wrong LFS size (run git lfs pull): " + asset.path);
            requireCheck(await hashFile(file,"sha256") === pointer.oid, "LFS object hash mismatch: " + asset.path);
            lfsCount++;
        } else {
            requireCheck(await hashFile(file,"sha1","blob "+size+"\0") === asset.gitBlob, "Git binary hash mismatch: "+asset.path);
        }
        // Unreal IoStore TOCs begin with the standard 16-byte magic.
        if (ext === ".utoc") {
            const fd=fs.openSync(file,"r"), b=Buffer.alloc(16);
            try { fs.readSync(fd,b,0,16,0); } finally { fs.closeSync(fd); }
            requireCheck(b.toString("ascii") === "-==--==--==--==-", "Invalid IoStore TOC header: "+asset.path);
        }
        bytes+=size;
    }
    requireCheck(groups.size === manifest.tripletCount && groups.size === 24, "Wrong container count");
    for (const [stem,exts] of groups) requireCheck([".pak",".utoc",".ucas"].every(x=>exts.has(x)) && exts.size===3, "Incomplete triplet: "+stem);
    const pakDir = path.join(root,"ProjectPBZ","Content","Paks","~mods");
    const actual = fs.readdirSync(pakDir).filter(x=>/\.(pak|utoc|ucas)$/i.test(x)).map(x=>"ProjectPBZ/Content/Paks/~mods/"+x);
    requireCheck(actual.length === assetPaths.size && actual.every(x=>assetPaths.has(x)), "Extra/missing cooked assets in checkout");
    console.log("Asset verification passed:", assetPaths.size, "files,", groups.size, "triplets,", lfsCount, "LFS-backed files,", bytes, "bytes");
    console.log("These checks do not test Unreal/PuerTS integration in-game.");
}
main().catch(error => { console.error(error.stack || error); process.exitCode=1; });
