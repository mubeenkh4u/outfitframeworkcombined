"use strict";
const UE = require("ue"), P = require("puerts"), C = require("./catalog");
// Native mixins may retain a callback across a PBZMDL reload. Keep its identity
// stable and switch its target, including after the owning source is reloaded.
const patchRegistry = globalThis.__PBZSoulHairStudioPatches ||= new WeakMap();
exports.valid = function (obj) {
    if (!obj) return false;
    try { return UE.KismetSystemLibrary.IsValid(obj); }
    catch (error) { if (/invalid object|object is invalid/i.test(String(error))) return false; throw error; }
};
exports.guard = function () {
    if (UE.KismetSystemLibrary.GetEngineVersion() !== C.ENGINE) throw new Error("Unsupported game engine; expected " + C.ENGINE);
    if (!exports.valid(P.argv.getByName("GameInstance"))) throw new Error("GameInstance is not ready");
};
exports.fingerprint = function (fn) {
    if (typeof fn !== "function") return "";
    let h = 2166136261;
    for (const c of Function.prototype.toString.call(fn).replace(/\r\n/g, "\n").trim()) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h.toString(16).padStart(8, "0");
};
exports.path = obj => exports.valid(obj) ? UE.KismetSystemLibrary.GetPathName(obj) : "";
exports.gi = () => P.argv.getByName("GameInstance");
// This is the actual BP field written by native bindPreviewDollMeshes. PuerTS
// property lookup is case-sensitive; the generated SDK's lowercase name is stale.
exports.head = component => exports.valid(component) ? component.Meshhead : null;
exports.make = (type, owner) => UE.NewObject(type.StaticClass(), owner || exports.gi());
exports.vector = function (x, y, z) { const v = new UE.Vector(); v.X = x; v.Y = y; v.Z = z; return v; };
exports.vec2 = function (x, y) { const v = new UE.Vector2D(); v.X = x; v.Y = y; return v; };
exports.brushSize = function (brush, x, y) {
    // UE 5.7 stores this field as FDeprecateSlateVector2D, not FVector2D.
    // Reuse the field's native wrapper so PuerTS retains its exact struct type.
    const size = brush.ImageSize; size.X = x; size.Y = y; brush.ImageSize = size;
};
exports.rgba = function (values, alpha = 1) { const c = new UE.LinearColor(); [c.R, c.G, c.B] = values; c.A = alpha; return c; };
exports.text = s => UE.KismetTextLibrary.Conv_StringToText(s);
exports.margin = function (l, t = l, r = l, b = t) { const m = new UE.Margin(); m.Left = l; m.Top = t; m.Right = r; m.Bottom = b; return m; };
exports.children = function (component) {
    const out = P.$ref();
    component.GetChildrenComponents(true, out);
    const a = P.$unref(out), result = [];
    for (let i = 0; i < a.Num(); i++) result.push(a.Get(i));
    return result;
};
exports.loadClass = function (path) {
    const cls = UE.Class.Load(path);
    if (!exports.valid(cls) || exports.path(cls).toLowerCase() !== path.toLowerCase()) throw new Error("Exact native class unavailable: " + path);
    return cls;
};
exports.newWidget = function (path, context) {
    const cls = exports.loadClass(path), controller = UE.GameplayStatics.GetPlayerController(context || exports.gi(), 0);
    const widget = UE.WidgetBlueprintLibrary.Create(context || exports.gi(), cls, controller);
    if (!exports.valid(widget)) throw new Error("Cannot create native widget: " + path);
    return widget;
};
class Scope {
    constructor() { this.active = true; this.timers = new Set(); this.cleanups = []; this.errors = new Map(); }
    log(s) { console.log("[PBZMOD] " + C.ID + " " + s); }
    report(where, error) {
        const message = where + ": " + String(error && error.stack || error), last = this.errors.get(where);
        if (!last || last.message !== message || Date.now() - last.at > 15000) { console.error("[PBZMOD] " + C.ID + " " + message); this.errors.set(where, { message, at: Date.now() }); }
    }
    safe(where, fn) { try { return fn(); } catch (e) { this.report(where, e); return undefined; } }
    later(fn, ms = 0) {
        if (!this.active) return;
        const id = setTimeout(() => { this.timers.delete(id); if (this.active) this.safe("deferred", fn); }, ms);
        this.timers.add(id); return id;
    }
    repeat(fn, ms) { const run = () => { if (this.active) { this.safe("refresh", fn); this.later(run, ms); } }; this.later(run, ms); }
    cleanup(fn) { this.cleanups.push(fn); }
    // Both native mixin copies and module prototypes are restored by identity.
    patch(owner, name, wrapper, expected, classPath) {
        let records = patchRegistry.get(owner);
        if (!records) { records = new Map(); patchRegistry.set(owner, records); }
        let record = records.get(name);
        const current = Reflect.get(owner, name), original = record && current === record.relay ? record.base : current;
        if (exports.fingerprint(original) !== expected) throw new Error("Native method changed or already patched: " + name);
        if (record && record.scope && record.scope.active) throw new Error("Hair hook is already owned: " + name);
        if (!record) {
            record = { base: original, scope: null, wrapper: null, relay: null };
            const stable = record;
            stable.relay = function (...args) { return stable.scope && stable.scope.active ? stable.wrapper.call(this, stable.base, ...args) : stable.base.apply(this, args); };
            records.set(name, record);
        }
        record.scope = this; record.wrapper = wrapper;
        const installed = record.relay;
        const descriptor = Object.getOwnPropertyDescriptor(owner, name);
        Object.defineProperty(owner, name, { ...descriptor, value: installed, writable: true, configurable: true });
        this.cleanup(() => {
            if (record.scope === this) { record.scope = null; record.wrapper = null; }
            if (Reflect.get(owner, name) === installed) { if (descriptor) Object.defineProperty(owner, name, descriptor); else Reflect.deleteProperty(owner, name); }
        });
        if (classPath) {
            const proto = P.blueprint.tojs(exports.loadClass(classPath)).prototype, before = Object.getOwnPropertyDescriptor(proto, name);
            Object.defineProperty(proto, name, { ...before, value: installed, writable: true, configurable: true });
            this.cleanup(() => { if (Reflect.get(proto, name) === installed) { if (before) Object.defineProperty(proto, name, before); else Reflect.deleteProperty(proto, name); } });
        }
    }
    stop() {
        if (!this.active) return;
        this.active = false; for (const id of this.timers) clearTimeout(id); this.timers.clear();
        const errors = [];
        for (const fn of this.cleanups.splice(0).reverse()) { try { fn(); } catch (e) { errors.push(String(e)); } }
        this.log("unloaded; native appearance and UI restored");
        if (errors.length) throw new Error(errors.join("; "));
    }
}
exports.Scope = Scope;
class Settings {
    constructor(scope) {
        this.scope = scope; this.choice = { ...C.defaults }; this.blocked = false; this.document = {};
        this.hairColors = { soul: C.defaults.color, npc: C.defaults.color, wwm: C.defaults.color };
        this.glow = { enabled: false, level: C.eyeGlowMax };
        this.fillIntensity = C.fillIntensity.default;
        const culture = UE.KismetInternationalizationLibrary.GetCurrentLanguage();
        this.language = /^zh(?:[-_]|$)/i.test(culture) ? "zh" : "en";
        const dir = UE.KismetSystemLibrary.ConvertToAbsolutePath(UE.KismetSystemLibrary.GetProjectSavedDirectory());
        if (!dir || /(^|[\\/])SaveGames([\\/]|$)/i.test(dir)) throw new Error("Invalid settings directory");
        this.file = dir.replace(/[\\/]+$/, "") + "/" + C.ID + ".json";
        try {
            if (UE.BlueprintPathsLibrary.FileExists(this.file)) {
                const out = P.$ref("");
                if (!UE.EasyCsv.LoadStringFromLocalFile(this.file, out)) throw new Error("Cannot read hair settings");
                const data = JSON.parse(P.$unref(out).replace(/^\uFEFF/, ""));
                if (data.version !== 1 || !C.validChoice(data.choice)) throw new Error("Unsupported hair settings");
                this.document = data; this.choice = C.normalize(data.choice);
                for (const family of Object.keys(this.hairColors)) {
                    const saved = data.hairColors?.[family];
                    const color = data.hairColors === undefined ? this.choice.color : saved;
                    if (C.colors.some(entry => entry.id === color)) this.hairColors[family] = color;
                }
                this.choice.color = this.hairColors[C.hairFamily(this.choice.style)];
                if (C.validLanguage(data.language)) this.language = data.language;
            }
        } catch (e) { this.blocked = true; scope.report("settings preserved", e); }
    }
    readVisualSettings(create = false) {
        const content = UE.KismetSystemLibrary.GetProjectContentDirectory();
        const file = UE.KismetSystemLibrary.ConvertToAbsolutePath(content.replace(/[\\/]?$/, "/") + "Paks/~mods/" + C.ID + ".txt");
        if (!UE.BlueprintPathsLibrary.FileExists(file)) {
            const defaults = "EyeGlow=Off\r\nEyeGlowLevel=" + C.eyeGlowMax.toFixed(1) + "\r\nFillLightIntensity=" + C.fillIntensity.default + "\r\n";
            if (create && !UE.EasyCsv.SaveStringToFileWithFullPath(defaults, file)) throw new Error("Cannot create appearance visual settings");
            return;
        }
        const out = P.$ref("");
        if (!UE.EasyCsv.LoadStringFromLocalFile(file, out)) throw new Error("Cannot read appearance visual settings");
        const values = new Map();
        for (const line of String(P.$unref(out)).replace(/^\uFEFF/, "").split(/\r?\n/)) {
            const row = /^\s*(EyeGlow|EyeGlowLevel|FillLightIntensity)\s*=\s*([^;#]*?)\s*(?:[;#].*)?$/i.exec(line);
            if (row && !values.has(row[1].toLowerCase())) values.set(row[1].toLowerCase(), row[2]);
        }
        const enabled = values.get("eyeglow");
        const number = (key, fallback) => {
            const raw = values.get(key) ?? "";
            const value = Number(raw);
            return /^[-+]?\d*\.?\d+$/.test(raw) && Number.isFinite(value) ? value : fallback;
        };
        this.glow = {
            enabled: /^(on|true|1|yes)$/i.test(enabled ?? ""),
            level: C.eyeGlowLevel(number("eyeglowlevel", C.eyeGlowMax))
        };
        this.fillIntensity = Math.round(Math.max(0, Math.min(C.fillIntensity.max, number("filllightintensity", C.fillIntensity.default))));
    }
    registerVisualMenu(onChanged) {
        const menu = globalThis.PBZModsMenu ||= [];
        if (typeof menu.push !== "function") return;
        const entry = {
            id: C.ID,
            title: { en: "Soul's Appearance Studio", "zh-Hans": "魂的外观工坊", "zh-Hant": "魂的外觀工坊" },
            version: C.VERSION,
            file: C.ID + ".txt",
            settings: [
                { key: "EyeGlow", type: "toggle", default: false, label: { en: "Iris Glow", "zh-Hans": "瞳色自发光", "zh-Hant": "瞳色自發光" } },
                { key: "EyeGlowLevel", type: "number", min: 0, max: C.eyeGlowMax, step: .1, default: C.eyeGlowMax,
                    label: { en: "Iris Glow Brightness", "zh-Hans": "瞳色自发光亮度", "zh-Hant": "瞳色自發光亮度" } },
                { key: "FillLightIntensity", type: "number", min: 0, max: C.fillIntensity.max, step: 1, default: C.fillIntensity.default,
                    label: { en: "Gameplay Fill Light (cd)", "zh-Hans": "实战补光强度（坎德拉）", "zh-Hant": "實戰補光強度（坎德拉）" },
                    help: { en: "Adjust Soul's face light during gameplay. At 0 the light is off.",
                        "zh-Hans": "调整魂的实战面部补光。设为 0 时熄灭。", "zh-Hant": "調整魂的實戰面部補光。設為 0 時熄滅。" } }
            ],
            onChange: () => {
                if (!this.scope.active) return;
                this.scope.safe("refresh appearance visual settings", () => { this.readVisualSettings(); onChanged(); });
            }
        };
        menu.push(entry);
        this.scope.cleanup(() => {
            if (!Array.isArray(menu)) return;
            const index = menu.indexOf(entry);
            if (index >= 0) menu.splice(index, 1);
        });
    }
    withChoiceField(kind, value) {
        const choice = { ...this.choice, [kind]: value };
        if (kind === "style") choice.color = this.hairColors[C.hairFamily(value)];
        return choice;
    }
    save(choice, resetColors = false) {
        if (!C.validChoice(choice)) throw new Error("Invalid hair selection");
        this.choice = C.normalize(choice);
        if (resetColors) for (const family of Object.keys(this.hairColors)) this.hairColors[family] = C.defaults.color;
        this.hairColors[C.hairFamily(this.choice.style)] = this.choice.color;
        return this.write();
    }
    setLanguage(language) {
        if (!C.validLanguage(language)) throw new Error("Invalid display language");
        this.language = language;
        return this.write();
    }
    write() {
        if (this.blocked) return false;
        try {
            const data = { ...this.document, version: 1, choice: { ...this.document.choice, ...this.choice },
                hairColors: { ...this.hairColors }, language: this.language };
            const text = JSON.stringify(data, null, 2), out = P.$ref("");
            if (!UE.EasyCsv.SaveStringToFileWithFullPath(text, this.file) || !UE.EasyCsv.LoadStringFromLocalFile(this.file, out) || P.$unref(out).replace(/^\uFEFF/, "") !== text) throw new Error("Hair settings write/readback failed");
            this.document = data;
            return true;
        } catch (e) { this.scope.report("settings", e); return false; }
    }
}
exports.Settings = Settings;
