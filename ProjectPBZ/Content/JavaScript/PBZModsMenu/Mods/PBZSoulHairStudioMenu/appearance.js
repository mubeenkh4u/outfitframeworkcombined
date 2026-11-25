"use strict";
const UE = require("ue"), P = require("puerts"), C = require("./catalog"), R = require("./runtime");
const { Accessories } = require("./accessories");
const Hats = require("./hats");
const compat = require("./combined-compat");
const HAIR_NAMES = new Set(["MI_ZeroHun_HairCard_Health", "MI_ZeroHun_HairCard_Injured30", "MI_ZeroHun_HairCard_Injured60", "MI_ZeroHun_HairCard_Injured100", "MI_EliteBoss_ZuoShang_HairCard_P2", "MI_Hero_Hun_MoQu_HairCard", "MI_Hun_Haircard_Healthfade", "MI_ZeroHun_Groom_Health", "MI_ZeroHun_Groom_Injured30", "MI_ZeroHun_Groom_Injured60", "MI_ZeroHun_Groom_Injured100"]);
// The shipped MoQu sequence groom uses M_Hair under a different MI name.
HAIR_NAMES.add("MI_JiGuanMoQu_Hair");
// The existing local silver-gray PAK keeps its assets and native selection
// branch. Its private material instances are also valid restoration baselines.
for (const route of ["HairCard", "Groom"]) for (const state of ["Health", "Injured30", "Injured60", "Injured100"]) HAIR_NAMES.add("MI_FengXue_" + route + "_" + state);
const npcHairMaterials = new Set(C.styles.filter(style => style.nativeNPC).flatMap(style => style.parts.flatMap(part => part.materials)));
const referenceCards = new Set(["MI_EliteBoss_Don_Fur", "MI_Hero_Hun_MoQu_HairCard"]);
function nameOf(path) { return path.slice(path.lastIndexOf(".") + 1); }
function staticHair(material, family) {
    let m = material;
    for (let i = 0; i < 12 && R.valid(m); i++) {
        const path = R.path(m), name = nameOf(path);
        if (family === "wwm" && C.wwmPenglai && path === C.wwmPenglai.material) return { groom: false, penglai: true };
        const match = family === "npc" ? npcHairMaterials.has(path) : family === "soul" ?
            !path.includes("/PBZMods/SoulHairStudio/") && HAIR_NAMES.has(name) : path === C.wwmBaseMaterial;
        if (match) return { groom: name.includes("Groom") || name === "MI_JiGuanMoQu_Hair", reference: referenceCards.has(name) };
        if (!m.IsA(UE.MaterialInstance.StaticClass())) return null;
        m = m.Parent;
    }
    return null;
}
function equal(a, b) {
    if (typeof a === "number") return Math.abs(a - b) < 1e-6;
    if (Array.isArray(a)) return a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
    return a === b;
}
function read(mid, kind, name) {
    if (kind === "scalar") return mid.K2_GetScalarParameterValue(name);
    if (kind === "texture") return mid.K2_GetTextureParameterValue(name);
    const c = mid.K2_GetVectorParameterValue(name); return [c.R, c.G, c.B, c.A];
}
function write(mid, kind, name, value) {
    if (kind === "scalar") mid.SetScalarParameterValue(name, value);
    else if (kind === "texture") mid.SetTextureParameterValue(name, value);
    else mid.SetVectorParameterValue(name, R.rgba(value.slice(0, 3), value[3]));
}
class Dyes {
    constructor(scope) { this.scope = scope; this.records = new Map(); this.textures = new Map(); }
    texture(path) {
        let texture = this.textures.get(path);
        if (!R.valid(texture)) {
            texture = UE.Texture2D.Load(path);
            if (!R.valid(texture) || R.path(texture) !== path) throw new Error("Hair dye texture unavailable: " + path);
            this.textures.set(path, texture);
        }
        return texture;
    }
    cardDye(mid, native, record, family, profile) {
        const current = mid.K2_GetTextureParameterValue("Diffuse");
        const last = record.params.get("texture:Diffuse");
        const source = last && current === last.applied ? last.before : current;
        const useAtlas = family === "wwm" || !native.reference && R.path(source) === profile.sourceAtlas;
        this.assign(mid, "texture", "Diffuse", this.texture(useAtlas ? profile.atlas : profile.white), record);
        if (native.reference) return;
        // The WWM atlas is authored in its own reflectance range. Legacy
        // native shade maps retain their original average .82 compensation.
        this.assign(mid, "scalar", "Brightness", profile.brightness ?? (useAtlas ? 1 / .82 : 1), record);
        this.assign(mid, "scalar", "RandomHueVariation", 0, record);
        this.assign(mid, "scalar", "RandomValueVariation", profile.valueVariation, record);
    }
    targets(component) {
        const head = R.head(component);
        if (!R.valid(head)) return [];
        return [head, ...R.children(head)].filter(x => {
            if (!R.valid(x) || !x.IsA(UE.PrimitiveComponent.StaticClass())) return false;
            if (x.IsA(UE.GroomComponent.StaticClass())) {
                const path = R.path(x.GroomAsset);
                // Eyebrows and eyelashes use their original materials and color.
                return !!path && !/Brow|Lash/i.test(path);
            }
            return x.IsA(UE.SkinnedMeshComponent.StaticClass());
        });
    }
    assign(mid, kind, name, value, record) {
        const key = kind + ":" + name, current = read(mid, kind, name), item = record.params.get(key);
        if (!item) record.params.set(key, { kind, name, before: current, applied: value });
        else {
            // Native refreshes may reuse a MID. Preserve its latest native value.
            if (!equal(current, item.applied)) item.before = current;
            item.applied = value;
        }
        if (!equal(current, value)) write(mid, kind, name, value);
    }
    apply(component, colorID, targets, family = "soul", style) {
        const color = C.colors.find(x => x.id === colorID);
        if (!color) throw new Error("Unknown hair color");
        if (color.id === "native") { this.restoreComponent(component, family); return; }
        const rgb = C.linear(color.hex), vector = [...rgb, 1];
        const profile = family === "wwm" ? C.wwmHairDye(style) : C.hairDye[family];
        for (const target of targets || this.targets(component)) {
            for (let slot = 0; slot < target.GetNumMaterials(); slot++) {
                let mid = target.GetMaterial(slot);
                const native = staticHair(mid, family);
                if (!native) continue;
                let record = this.records.get(mid);
                if (!record) {
                    const original = mid;
                    const dynamic = original.IsA(UE.MaterialInstanceDynamic.StaticClass());
                    const parent = dynamic ? original.Parent : original;
                    const overrides = target.OverrideMaterials;
                    const inherited = overrides && (slot >= overrides.Num() || !R.valid(overrides.Get(slot)));
                    const name = family === "wwm" ? "WWMHairCardsDye" : "HairDye";
                    mid = target.CreateDynamicMaterialInstance(slot, parent, C.ID + name);
                    if (!R.valid(mid) || mid === original) throw new Error("Independent hair dye material unavailable");
                    try {
                        if (dynamic) mid.CopyParameterOverrides(original);
                    } catch (error) { target.SetMaterial(slot, inherited ? null : original); throw error; }
                    record = { component, target, slot, original, inherited, family, params: new Map(),
                        live: dynamic ? new Map(liveFaceParameters(original).map(v => [v.key, liveSignature(v)])) : null };
                    this.records.set(mid, record);
                }
                if (native.groom) {
                    // The native groom shader uses PaintColor/PaintMask for RGB;
                    // DyeColor itself is a scalar, so it is never fed an RGB value.
                    this.assign(mid, "texture", "PaintMask", this.texture(profile.mask), record);
                    this.assign(mid, "vector", "PaintColor", vector, record);
                    for (const [name, value] of [["HairMelanin", color.melanin], ["MelaninVariation", 0], ["HairRedness", 0], ["WhiteHair | Amount", 0], ["DyeColor | Variation", 0], ["DyeColor", rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722]]) this.assign(mid, "scalar", name, value, record);
                } else {
                    this.cardDye(mid, native, record, family, native.penglai ? C.wwmPenglai.dye : profile);
                    this.assign(mid, "vector", "RootColor", vector, record);
                    this.assign(mid, "vector", "TipColor", vector, record);
                }
            }
        }
    }
    restoreRecord(mid, record) {
        const { target, slot, original } = record;
        if (!R.valid(target) || !R.valid(original) || target.GetMaterial(slot) !== mid) return;
        // Preserve native damage/dissolve changes made on the displayed MID.
        if (original.IsA(UE.MaterialInstanceDynamic.StaticClass())) {
            const latest = new Map(liveFaceParameters(original).map(v => [v.key, liveSignature(v)]));
            for (const v of liveFaceParameters(mid)) {
                const kind = v.method.includes("Scalar") ? "scalar" : "vector";
                const baseline = record.live.get(v.key);
                if (!record.params.has(kind + ":" + v.info.Name) && liveSignature(v) !== baseline &&
                    latest.get(v.key) === baseline) original[v.method](v.info, v.value);
            }
        }
        target.SetMaterial(slot, record.inherited ? null : original);
    }
    restoreComponent(component, family) { for (const [mid, r] of this.records) if (r.component === component && (!family || r.family === family)) { this.restoreRecord(mid, r); this.records.delete(mid); } }
    prune() { for (const [mid, r] of this.records) if (!R.valid(mid) || !R.valid(r.component) || !R.valid(r.target) || r.target.GetMaterial(r.slot) !== mid) this.records.delete(mid); }
    stop() { for (const [mid, r] of this.records) this.scope.safe("restore color", () => this.restoreRecord(mid, r)); this.records.clear(); this.textures.clear(); }
}
exports.Dyes = Dyes;
// Keep the native head as the hair/groom binding target. A separate, owned face
// follows its pose by bone name; changing a face never retargets groom bindings.
function renderFlag(head, name) {
    return name === "bVisibleInRayTracing" ? head[name].Default : head[name];
}
function faceMaterialKind(material) {
    let m = material;
    for (let i = 0; i < 12 && R.valid(m); i++) {
        const name = nameOf(R.path(m));
        if (/Eye|Brow|Lash/i.test(name)) return "eye";
        if (/Teeth/i.test(name)) return "teeth";
        if (/Head|Skin/i.test(name)) return "skin";
        if (!m.IsA(UE.MaterialInstance.StaticClass())) break;
        m = m.Parent;
    }
    return "";
}
const youngSkinPackage = "/Game/PBZContent/Characters/Hero/Hun_Young/Material/V02/MI_Hero_Hun_Young_Skin";
const youngCleanPath = youngSkinPackage + ".MI_Hero_Hun_Young_Skin";
const youngDirtPath = youngSkinPackage + "_Dirt.MI_Hero_Hun_Young_Skin_Dirt";

function youngCleanSkin(mesh) {
    const slot = mesh.Materials?.Num() > 0 ? mesh.Materials.Get(0) : null;
    if (slot?.MaterialSlotName !== "MI_HunYoung_Skin1" || R.path(slot.MaterialInterface) !== youngDirtPath) return null;
    const clean = UE.MaterialInterface.Load(youngCleanPath);
    if (!R.valid(clean) || R.path(clean) !== youngCleanPath || !clean.IsA(UE.MaterialInstance.StaticClass())) {
        throw new Error("Native clean Young Soul skin unavailable");
    }
    return clean;
}

function liveFaceParameters(source, cleanYoung = false) {
    const live = [];
    for (const [field, method] of [["ScalarParameterValues", "SetScalarParameterValueByInfo"], ["VectorParameterValues", "SetVectorParameterValueByInfo"]]) {
        const values = source[field];
        if (!values || typeof values.Num !== "function") continue;
        for (let i = 0; i < values.Num(); i++) {
            const value = values.Get(i), info = value.ParameterInfo;
            if (cleanYoung && /^Dirt_/i.test(String(info.Name))) continue;
            live.push({ method, info, value: value.ParameterValue, key: [field, info.Name, info.Association, info.Index].join(":") });
        }
    }
    return live;
}

function liveSignature(parameter) {
    const value = parameter.value;
    return typeof value === "number" ? value : [value.R, value.G, value.B, value.A].join(",");
}

class Faces {
    constructor(scope) { this.scope = scope; this.records = new Map(); this.nativeSkins = new Map(); }
    bindNativeSkin(component, head, mesh, base, name) {
        const overrides = head.OverrideMaterials;
        if (!overrides || typeof overrides.Num !== "function") return null;
        const before = overrides.Num() > 0 ? overrides.Get(0) : null;
        const mid = head.CreateDynamicMaterialInstance(0, base, C.ID + name);
        if (!R.valid(mid) || head.GetMaterial(0) !== mid) throw new Error("Native face skin override did not bind");
        this.nativeSkins.set(component, { head, mesh, before, mid });
        return mid;
    }
    syncMoquSkin(component, head, mesh) {
        let material = head.GetMaterial(0);
        for (let depth = 0; depth < 12 && R.valid(material); depth++) {
            if (/^MI_ZeroHun_Head_(?:health|injured30|injured60|injured100)$/i.test(nameOf(R.path(material)))) {
                const slot = mesh.Materials?.Num() > 0 ? mesh.Materials.Get(0) : null;
                const native = slot?.MaterialInterface;
                if (slot?.MaterialSlotName !== "M_Hun_V01_Head" || nameOf(R.path(native)) !== "MI_Hero_Hun_JiGuanMoQu_Head_New_Purple") return;
                this.bindNativeSkin(component, head, mesh, native, "MoQuSkin");
                return;
            }
            if (!material.IsA(UE.MaterialInstance.StaticClass())) return;
            material = material.Parent;
        }
    }
    syncYoungSkin(component, head, mesh) {
        const current = head.GetMaterial(0);
        let material = current;
        for (let depth = 0; depth < 12 && R.valid(material); depth++) {
            if (R.path(material) === youngDirtPath) {
                const clean = youngCleanSkin(mesh);
                if (!clean) return;
                const mid = this.bindNativeSkin(component, head, mesh, clean, "YoungSkin");
                if (mid && current.IsA(UE.MaterialInstanceDynamic.StaticClass())) {
                    for (const value of liveFaceParameters(current, true)) mid[value.method](value.info, value.value);
                }
                return;
            }
            if (!material.IsA(UE.MaterialInstance.StaticClass())) return;
            material = material.Parent;
        }
    }
    restoreNativeSkin(component) {
        const r = this.nativeSkins.get(component); if (!r) return;
        this.nativeSkins.delete(component);
        if (R.valid(r.head) && r.head.GetSkeletalMeshAsset() === r.mesh && r.head.GetMaterial(0) === r.mid) {
            r.head.SetMaterial(0, R.valid(r.before) ? r.before : null);
        }
    }
    syncMaterials(r) {
        const sameMesh = R.path(r.head.GetSkeletalMeshAsset()).toLowerCase() === r.path.toLowerCase();
        for (let slot = 0; slot < Math.min(r.head.GetNumMaterials(), r.face.GetNumMaterials()); slot++) {
            const source = r.head.GetMaterial(slot), target = r.face.GetMaterial(slot), kind = faceMaterialKind(target);
            if (!R.valid(source) || !R.valid(target) || !kind || kind === "eye" || faceMaterialKind(source) !== kind) continue;
            if (sameMesh) { if (source !== target) r.face.SetMaterial(slot, source); continue; }
            if (!source.IsA(UE.MaterialInstanceDynamic.StaticClass())) continue;
            let item = r.materials.get(slot);
            if (!item || item.mid !== target || item.source !== source) {
                const original = item && item.mid === target ? item.original : target;
                const mid = r.face.CreateDynamicMaterialInstance(slot, original, C.ID + "Face");
                if (!R.valid(mid)) throw new Error("Native face MID creation failed");
                item = { mid, original, source }; r.materials.set(slot, item);
            }
            // Copy only live scalar/vector overrides. Keep the selected face's
            // UV-specific texture maps and the separate eye-color lifecycle.
            const live = liveFaceParameters(source, r.cleanYoung && slot === 0);
            const keys = new Set(live.map(x => x.key));
            if (item.keys && [...item.keys].some(key => !keys.has(key))) {
                item.mid = r.face.CreateDynamicMaterialInstance(slot, item.original, C.ID + "Face");
                if (!R.valid(item.mid)) throw new Error("Native face MID refresh failed");
            }
            for (const value of live) item.mid[value.method](value.info, value.value);
            item.keys = keys;
        }
    }
    apply(component, path, enabled, explicitFace, fill) {
        if (!enabled) {
            this.restore(component);
            const head = R.head(component);
            fill?.castFrom(head);
            return head;
        }
        const head = R.head(component), owner = component.GetOwner();
        if (!R.valid(head) || !R.valid(owner)) return null;
        // Selecting the native mesh needs no replacement component. Preserve
        // its complete lighting, material and render state on the real head.
        const mesh = head.GetSkeletalMeshAsset();
        const cleanYoung = explicitFace === "young";
        if (R.path(mesh).toLowerCase() === path.toLowerCase()) {
            if (this.records.has(component)) this.restore(component);
            const prior = this.nativeSkins.get(component);
            if (prior && (prior.head !== head || prior.mesh !== mesh)) this.restoreNativeSkin(component);
            if (explicitFace === "moqu") this.syncMoquSkin(component, head, mesh);
            else if (cleanYoung) this.syncYoungSkin(component, head, mesh);
            else this.restoreNativeSkin(component);
            fill?.castFrom(head);
            return head;
        }
        this.restoreNativeSkin(component);
        if (fill?.ownsCaster(head)) this.scope.safe("release native head shadow caster", () => fill.restoreCaster());
        let r = this.records.get(component);
        if (r && (r.head !== head || !R.valid(r.face))) { this.restore(component); r = null; }
        if (!r) {
            const rendering = [["bRenderInMainPass", "SetRenderInMainPass"], ["bRenderInDepthPass", "SetRenderInDepthPass"], ["bVisibleInRayTracing", "SetVisibleInRayTracing"], ["CastShadow", "SetCastShadow"]].map(([name, method]) => {
                const before = renderFlag(head, name);
                if (typeof before !== "boolean" || typeof head[method] !== "function") throw new Error("Native head rendering contract unavailable: " + name);
                return { name, method, before };
            });
            const transform = UE.KismetMathLibrary.MakeTransform(R.vector(0, 0, 0), new UE.Rotator(), R.vector(1, 1, 1));
            const face = owner.AddComponentByClass(UE.SkeletalMeshComponent.StaticClass(), true, transform, false);
            if (!R.valid(face)) throw new Error("Native face component creation failed");
            try {
                // Like Soul's native head, the replacement must ignore ground decals.
                face.SetReceivesDecals(false);
                if (face.bReceivesDecals !== false) throw new Error("Replacement face decal opt-out did not apply");
            } catch (error) {
                face.K2_DestroyComponent(owner);
                throw error;
            }
            r = { face, head, path: "", tick: head.VisibilityBasedAnimTickOption, rendering, materials: new Map() };
            this.records.set(component, r);
            face.K2_AttachToComponent(head, "None", UE.EAttachmentRule.KeepRelative, UE.EAttachmentRule.KeepRelative, UE.EAttachmentRule.KeepRelative, false);
            face.SetCollisionEnabled(UE.ECollisionEnabled.NoCollision);
            face.bUseBoundsFromLeaderPoseComponent = true;
            face.SetLeaderPoseComponent(head, true, false);
        }
        if (r.path !== path) {
            const mesh = UE.SkeletalMesh.Load(path);
            if (!R.valid(mesh) || R.path(mesh).toLowerCase() !== path.toLowerCase()) throw new Error("Native face asset unavailable: " + path);
            for (let slot = 0; slot < r.face.GetNumMaterials(); slot++) r.face.SetMaterial(slot, null);
            r.face.SetSkeletalMeshAsset(mesh); r.face.SetLeaderPoseComponent(head, true, false); r.path = path; r.materials.clear();
            r.cleanYoung = false;
        }
        if (r.cleanYoung !== cleanYoung) {
            const clean = cleanYoung ? youngCleanSkin(r.face.GetSkeletalMeshAsset()) : null;
            if (!cleanYoung || clean) {
                r.face.SetMaterial(0, clean);
                r.materials.delete(0);
                r.cleanYoung = cleanYoung;
            }
        }
        this.syncMaterials(r);
        // Match the shipped TsHelper attachment path: an owned mesh must use
        // the real parent's channels, including the native head's fill light.
        const channels = head.LightingChannels, current = r.face.LightingChannels;
        const names = ["bChannel0", "bChannel1", "bChannel2"];
        if (!channels || !current || names.some(name => typeof channels[name] !== "boolean" || typeof current[name] !== "boolean") || typeof r.face.SetLightingChannels !== "function") throw new Error("Native face lighting contract unavailable");
        if (names.some(name => channels[name] !== current[name])) r.face.SetLightingChannels(channels.bChannel0, channels.bChannel1, channels.bChannel2);
        // High-quality strands need the original head's scene proxy for their
        // binding surface. Hide only its surface passes, never the component.
        // Native visibility, actor hiding and HiddenInGame remain authoritative.
        if (r.face.IsVisible() !== head.IsVisible()) r.face.SetVisibility(head.IsVisible(), false);
        head.VisibilityBasedAnimTickOption = UE.EVisibilityBasedAnimTickOption.AlwaysTickPoseAndRefreshBones;
        for (const flag of r.rendering) {
            if (flag.name === "CastShadow" && fill?.ownsCaster(r.face)) continue;
            if (renderFlag(r.face, flag.name) !== flag.before) r.face[flag.method](flag.before);
        }
        for (const flag of r.rendering) if (renderFlag(head, flag.name)) head[flag.method](false);
        if (r.face.bHiddenInGame !== head.bHiddenInGame) r.face.SetHiddenInGame(head.bHiddenInGame, false);
        fill?.castFrom(r.face);
        return r.face;
    }
    restore(component) {
        this.restoreNativeSkin(component);
        const r = this.records.get(component); if (!r) return;
        if (R.valid(r.face)) r.face.K2_DestroyComponent(r.face.GetOwner());
        if (R.valid(r.head)) {
            if (r.head.VisibilityBasedAnimTickOption === UE.EVisibilityBasedAnimTickOption.AlwaysTickPoseAndRefreshBones) r.head.VisibilityBasedAnimTickOption = r.tick;
            for (const flag of r.rendering) if (renderFlag(r.head, flag.name) === false && flag.before) r.head[flag.method](flag.before);
        }
        this.records.delete(component);
    }
    stop() { for (const c of new Set([...this.records.keys(), ...this.nativeSkins.keys()])) this.scope.safe("restore face", () => this.restore(c)); }
}
class Eyes {
    constructor(scope) {
        this.scope = scope; this.records = new Map(); this.mask = null;
        const layer = (name, index) => {
            const parameter = new UE.MaterialParameterInfo();
            parameter.Name = name; parameter.Association = UE.EMaterialParameterAssociation.LayerParameter; parameter.Index = index;
            return parameter;
        };
        this.litAlbedo = layer("Albedo", 0);
        this.emission = layer("Albedo", 1);
        this.emissionColor = layer("Color", 1);
        this.emissionIntensity = layer("Intensity", 1);
    }
    restore(head) {
        const rows = this.records.get(head); if (!rows) return;
        if (R.valid(head)) for (const [slot, r] of rows) if (head.GetMaterial(slot) === r.mid) head.SetMaterial(slot, r.original);
        this.records.delete(head);
    }
    source(material) {
        for (let i = 0; i < 10 && R.valid(material) && material.IsA(UE.MaterialInstance.StaticClass()); i++, material = material.Parent) {
            const path = R.path(material);
            if (path === C.paths.eyeMaterial) return { material, mechanical: true };
            const name = nameOf(path);
            if ((name === "MI_ZeroHun_Eye_01" || name === "MI_Hero_Hun_Young_EyeBall") &&
                R.path(material.Parent) === "/AkashaEffects/MaterialLibrary/Material/CharacterMaterials/MA_EyeRefractive_02.MA_EyeRefractive_02") {
                return { material, mechanical: false };
            }
        }
        return null;
    }
    texture(path) {
        const asset = UE.Texture2D.Load(path);
        if (!R.valid(asset) || R.path(asset) !== path || !asset.IsA(UE.Texture2D.StaticClass())) throw new Error("Eye palette texture unavailable: " + path);
        return asset;
    }
    paletteTexture(family, swatch) {
        const name = "T_SHS_" + family + "_" + swatch.tile;
        return this.texture(C.paths.eyePalette + name + "." + name);
    }
    material(path) {
        const asset = UE.MaterialInterface.Load(path);
        if (!R.valid(asset) || R.path(asset) !== path || !asset.IsA(UE.MaterialInstance.StaticClass())) throw new Error("Native eye material unavailable: " + path);
        return asset;
    }
    create(head, slot, observed, original, source, layered, parent) {
        const mid = head.CreateDynamicMaterialInstance(slot, parent, C.ID + "Eye");
        try {
            if (!R.valid(mid) || !mid.IsA(UE.MaterialInstanceDynamic.StaticClass())) throw new Error("Native eye MID creation failed");
            if (parent === source.material && original.IsA(UE.MaterialInstanceDynamic.StaticClass())) mid.CopyParameterOverrides(original);
            const record = { original, source, mid, layered, iris: "native", sclera: "native" };
            if (layered) {
                record.irisTexture = mid.K2_GetTextureParameterValueByInfo(this.emission);
                record.irisColor = mid.K2_GetVectorParameterValueByInfo(this.emissionColor);
                record.scleraTexture = mid.K2_GetTextureParameterValueByInfo(this.litAlbedo);
                record.originalIntensity = mid.K2_GetScalarParameterValueByInfo(this.emissionIntensity);
                if (!R.valid(record.scleraTexture) || !Number.isFinite(record.originalIntensity)) throw new Error("Native eye emission parameters unavailable");
            } else {
                record.irisTexture = mid.K2_GetTextureParameterValue("IrisBaseColor");
                record.scleraTint = mid.K2_GetVectorParameterValue("ScleraTint");
                if (source.mechanical) {
                    record.scleraTexture = mid.K2_GetTextureParameterValue("ScleraBaseColor");
                    if (!R.valid(record.scleraTexture)) throw new Error("Native sclera base unavailable");
                }
            }
            if (!R.valid(record.irisTexture)) throw new Error("Native eye material parameters unavailable");
            return record;
        } catch (error) {
            head.SetMaterial(slot, observed);
            throw error;
        }
    }
    apply(head, id, scleraID = "native", glow = "native", level = C.eyeGlowMax) {
        if (!R.valid(head)) return;
        const lit = glow === "on" ? C.eyeGlowLevel(level) : 0;
        const defaultColors = id === "native" && scleraID === "native";
        if (defaultColors && glow === "native") { this.restore(head); return; }
        const iris = C.eyes.find(x => x.id === id), sclera = C.scleras.find(x => x.id === scleraID);
        if (!iris || !sclera) throw new Error("Invalid eye palette selection");
        let rows = this.records.get(head); if (!rows) this.records.set(head, rows = new Map());
        for (let slot = 0; slot < head.GetNumMaterials(); slot++) {
            const observed = head.GetMaterial(slot);
            let record = rows.get(slot);
            if (record && record.mid !== observed) {
                rows.delete(slot);
                record = null;
            }
            const original = record?.original ?? observed, source = record?.source ?? this.source(original);
            if (!source) continue;
            if (!source.mechanical && defaultColors && !lit) {
                if (record) { head.SetMaterial(slot, original); rows.delete(slot); }
                continue;
            }
            const layered = lit > 0 || source.mechanical && (glow === "native" || id === "native");
            const swap = !record || record.layered !== layered;
            const useMask = layered && (!source.mechanical || id !== "native");
            const irisChanged = swap || record.iris !== id;
            const scleraChanged = swap || record.sclera !== scleraID;
            let irisTexture, scleraTexture;
            // Resolve resources before rebinding the live slot.
            if (irisChanged) {
                if (useMask) {
                    if (!R.valid(this.mask)) this.mask = this.texture(C.paths.eyeMask);
                    irisTexture = this.mask;
                } else if (!layered && id !== "native") irisTexture = this.paletteTexture("Iris", iris);
            }
            if (scleraChanged) {
                if (layered && !source.mechanical) {
                    const name = "T_SHS_GlowSclera_" + (sclera.tile || "native");
                    scleraTexture = this.texture(C.paths.eyeGlow + name + "." + name);
                } else if (layered && scleraID !== "native") scleraTexture = this.paletteTexture("MoQuSclera", sclera);
                else if (!layered && source.mechanical && scleraID === "native") scleraTexture = this.texture(C.paths.mechanicalEyeBase);
            }
            if (swap) {
                const parent = layered === source.mechanical ? source.material :
                    this.material(layered ? C.paths.eyeMaterial : C.paths.refractiveEyeMaterial);
                record = this.create(head, slot, observed, original, source, layered, parent);
                rows.set(slot, record);
            }
            const { mid } = record;
            if (irisChanged) {
                if (layered && (irisTexture || record.iris !== id)) {
                    mid.SetTextureParameterValueByInfo(this.emission, irisTexture ?? record.irisTexture);
                    mid.SetVectorParameterValueByInfo(this.emissionColor, useMask ? R.rgba(C.linear(iris.hex)) : record.irisColor);
                } else if (!layered && (irisTexture || record.iris !== id)) {
                    mid.SetTextureParameterValue("IrisBaseColor", irisTexture ?? record.irisTexture);
                }
                record.iris = id;
            }
            if (scleraChanged) {
                if (layered && (scleraTexture || record.sclera !== scleraID)) {
                    mid.SetTextureParameterValueByInfo(this.litAlbedo, scleraTexture ?? record.scleraTexture);
                } else if (!layered) {
                    if (source.mechanical) mid.SetTextureParameterValue("ScleraBaseColor", scleraTexture ?? record.scleraTexture);
                    if (record.sclera !== scleraID) mid.SetVectorParameterValue("ScleraTint", scleraID === "native" ? record.scleraTint : R.rgba(C.linear(sclera.hex)));
                }
                record.sclera = scleraID;
            }
            if (layered) {
                const intensity = glow === "native" ? record.originalIntensity : lit;
                if (intensity !== (record.intensity ?? record.originalIntensity)) mid.SetScalarParameterValueByInfo(this.emissionIntensity, intensity);
                record.intensity = intensity;
            }
        }
        for (const slot of rows.keys()) if (slot >= head.GetNumMaterials()) rows.delete(slot);
        for (const key of this.records.keys()) if (!R.valid(key)) this.records.delete(key);
    }
    stop() { for (const head of this.records.keys()) this.scope.safe("restore eye colors", () => this.restore(head)); }
}
exports.Faces = Faces; exports.Eyes = Eyes;
class Appearance {
    constructor(scope, settings) {
        this.scope = scope; this.settings = settings; this.records = new Map(); this.preview = new Map(); this.previewHatIntent = new WeakSet(); this.outfitOverrides = new WeakMap();
        this.previewViews = new Map(); this.previewOwners = new WeakMap(); this.retiredPreviews = new WeakSet(); this.dyes = new Dyes(scope); this.scanAt = 0;
        this.faces = new Faces(scope); this.eyes = new Eyes(scope); this.hairAssets = new Map(); this.accessories = new Accessories(scope);
        this.componentClass = R.loadClass(C.paths.appearanceComponent);
        this.sequenceClass = R.loadClass("/HuaShira/Animation/Seqs/ActorForSeqs/BP_Seq_Hun.BP_Seq_Hun_C");
        const native = require("./contract");
        this.bindSequenceMeshes = require("Gameplay/GameModeBuild").GameModeBuildMixinInterface.prototype.bindPreviewDollMeshes;
        if (R.fingerprint(this.bindSequenceMeshes) !== native.methods.Gameplay_GameModeBuild.bindPreviewDollMeshes) throw new Error("Native sequence mesh binding changed");
        scope.cleanup(() => this.stop());
        this.playerFill = new (require("./player-fill").PlayerFill)(scope);
    }
    record(component) {
        if (!this.scope.active || !R.valid(component) || !component.IsA(this.componentClass)) return null;
        const owner = component.GetOwner();
        if (!R.valid(owner)) return null;
        let record = this.records.get(component);
        if (!record) {
            record = { component, owner, row: "", outfit: "", observed: "", modified: false, dirty: false, retryAt: 0, retryDelay: 120, target: "", delegates: [], head: null, headMesh: null, bindings: new Map(), hairDecals: new Set() };
            const refresh = () => { record.dirty = true; this.scope.later(() => this.apply(component), 0); this.scope.later(() => this.apply(component), 80); };
            for (const name of ["EquipOutfitDelegate", "SkinColorChangedDelegate", "HatVisibilityChangedDelegate"]) {
                component[name].Add(refresh); record.delegates.push([name, refresh]);
            }
            this.records.set(component, record);
        }
        return record;
    }
    bindSequenceHead(component, record) {
        const owner = record.owner;
        if (!owner.IsA(this.sequenceClass) || !R.valid(owner.meshhead) || !owner.meshhead.IsA(UE.SkeletalMeshComponent.StaticClass()) || R.head(component) === owner.meshhead) return;
        // BP_InitOwnerMesh casts to the player blueprint. For this exact native
        // cinematic actor family, reuse the shipped preview binding instead of
        // enabling its gameplay appearance logic or changing its outfit.
        const fields = ["BodyComponent", "Meshhead", "Hun Hat", "Hun Hat01", "Mesh Scarf", "Mesh Band"];
        const before = fields.map(name => [name, component[name]]);
        this.bindSequenceMeshes(owner, component);
        for (const [name, value] of before) {
            const applied = component[name], prior = record.bindings.get(name);
            if (applied === value) continue;
            record.bindings.set(name, { before: prior && value === prior.applied ? prior.before : value, applied });
        }
    }
    releaseBindings(component, record) {
        if (R.valid(component)) for (const [name, binding] of record.bindings) if (component[name] === binding.applied) component[name] = binding.before && !R.valid(binding.before) ? null : binding.before;
        record.bindings.clear();
    }
    // The native wardrobe reuses preview dolls; retain the displayed outfit only
    // for its current view and avoid writes during camera/dissolve transitions.
    notePreviewView(view) {
        if (!R.valid(view) || !view.IsVisible() || view.inputBarSuspended === true) {
            this.clearPreviewView(view); return null;
        }
        const component = view.getPreviewDollComponent();
        if (!R.valid(component)) { this.clearPreviewView(view); return null; }
        if (this.previewViews.get(view) !== component) this.clearPreviewView(view);
        const previous = this.previewOwners.get(component);
        if (previous && previous !== view) this.clearPreviewView(previous);
        this.previewViews.set(view, component);
        this.previewOwners.set(component, view);
        this.retiredPreviews.delete(component);
        if (!this.previewBusy(component)) this.outfitOverrides.set(component, String(view.getDisplayedPreviewOutfitID()));
        return component;
    }
    previewBusy(component) {
        const view = this.previewOwners.get(component);
        if (!view) return false;
        if (!R.valid(view) || view.inputBarSuspended === true || !view.IsVisible() ||
            view.previewPhase != null && view.previewPhase !== 0) return true;
        const mode = view.getPreviewGameMode(), owner = component.GetOwner();
        if (!R.valid(mode) || !R.valid(owner) || owner.bHidden || mode.getActivePreviewDoll() !== owner) return true;
        const outfit = view.getDisplayedPreviewOutfitID();
        return !outfit || String(outfit).toLowerCase() === "none";
    }
    clearPreviewView(view) {
        const component = this.previewViews.get(view);
        this.previewViews.delete(view);
        if (!component || this.previewOwners.get(component) !== view) return;
        this.previewOwners.delete(component);
        this.outfitOverrides.delete(component);
        this.preview.delete(component);
        this.previewHatIntent.delete(component);
        this.retiredPreviews.add(component);
    }
    nativeRow(component) {
        const outfit = this.outfitOverrides.get(component) || component.GetEffectiveOutfit();
        if (!outfit || String(outfit).toLowerCase() === "none") return null;
        return { outfit: String(outfit), row: UE.PBZAppearanceComponent.GetAppearanceStruct(outfit), sequence: component.CurrentHunType === UE.EPBZHunType.SequenceHun || component.GetOwner().IsA(this.sequenceClass), wardrobePreview: this.outfitOverrides.has(component) };
    }
    preloadHair(row) {
        const refs = [row.HeadAsset, row.GroomPhysicsAsset];
        for (let i = 0; i < row.GroomDataArray.Num(); i++) {
            const groom = row.GroomDataArray.Get(i); refs.push(groom.GroomAsset, groom.GroomBindingAsset);
            for (let j = 0; groom.OverrideMaterials && j < groom.OverrideMaterials.Num(); j++) refs.push(groom.OverrideMaterials.Get(j));
        }
        for (const list of [row.HeadClothDataArray, row.HeadClothDataArrayHatHidden]) for (let i = 0; i < list.Num(); i++) refs.push(list.Get(i).ClothAsset);
        // The shipped BP resolves soft references without loading them. Warm only
        // the selected native row before asking it to rebuild a cinematic head.
        for (const ref of refs) {
            if (!ref || !UE.KismetSystemLibrary.IsValidSoftObjectReference(ref)) continue;
            const path = UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(ref);
            if (R.valid(this.hairAssets.get(path))) continue;
            const asset = UE.KismetSystemLibrary.LoadAsset_Blocking(ref);
            if (!R.valid(asset) || R.path(asset).toLowerCase() !== path.toLowerCase()) throw new Error("Native hair resource is not ready: " + path);
            this.hairAssets.set(path, asset);
        }
    }
    restoreHairDecals(record, keep) {
        for (const child of record.hairDecals) {
            if (keep?.has(child)) continue;
            if (R.valid(child) && child.GetOwner() === record.owner && child.bReceivesDecals === false) child.SetReceivesDecals(true);
            record.hairDecals.delete(child);
        }
    }
    nativeCloth(component, row, useNoHatRow) {
        if (useNoHatRow) {
            const noHat = row.HeadClothDataArrayHatHidden;
            return noHat.Num() ? noHat : row.HeadClothDataArray;
        }
        return component.GetEffectiveHeadClothData(row);
    }
    nativeParts(component, row, cloth) {
        const head = R.head(component), owner = component.GetOwner();
        // Only the direct slots owned by BP_ReplaceHairStyle belong to this row.
        const slots = R.children(head).filter(c => R.valid(c) && c.GetOwner() === owner && c.GetAttachParent() === head);
        const find = (ref, type, asset) => {
            const key = UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(ref).toLowerCase();
            return slots.find(c => c.IsA(type) && R.path(asset(c)).toLowerCase() === key);
        };
        const cards = [], strands = [];
        for (let i = 0; i < cloth.Num(); i++)
            cards.push(find(cloth.Get(i).ClothAsset, UE.ChaosClothComponent.StaticClass(), c => c.GetClothAsset()));
        for (let i = 0; i < row.GroomDataArray.Num(); i++) {
            const spec = row.GroomDataArray.Get(i);
            if (/brow|lash/i.test(UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(spec.GroomAsset))) continue;
            const part = find(spec.GroomAsset, UE.GroomComponent.StaticClass(), c => c.GroomAsset);
            const binding = UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(spec.GroomBindingAsset);
            strands.push(part && R.path(part.BindingAsset).toLowerCase() === binding.toLowerCase() ? part : null);
        }
        return { cards, strands };
    }
    followsHeadPose(part, head) {
        // UE resolves a follower of a follower directly to the root pose driver.
        // Wardrobe heads can drive themselves; gameplay heads can follow the body.
        return !part.bUseAttachedParentAsPoseComponent ||
            part.LeaderPoseComponent === (R.valid(head.LeaderPoseComponent) ? head.LeaderPoseComponent : head);
    }
    isLivePlayer(component) {
        return component.GetOwner() === UE.GameplayStatics.GetPlayerPawn(component, 0) &&
            !UE.GameplayStatics.IsGamePaused(component);
    }
    hairReady(component, row, checkVisibility, record, cloth = component.GetEffectiveHeadClothData(row)) {
        const { cards, strands } = this.nativeParts(component, row, cloth);
        if (record) {
            const parts = new Set([...cards, ...strands].filter(Boolean));
            this.restoreHairDecals(record, parts);
            for (const part of parts) if (part.bReceivesDecals === true) {
                record.hairDecals.add(part);
                part.SetReceivesDecals(false);
            }
        }
        if (![...cards, ...strands].every(Boolean)) return false;
        if (!checkVisibility) return true;
        const layer = strands.length && UE.KismetSystemLibrary.GetConsoleVariableIntValue("r.HairStrands.MainHairMode") === 1 ? strands : cards;
        const playing = this.isLivePlayer(component);
        return layer.every(part => part.IsVisible() && !part.bHiddenInGame &&
            (part.IsA(UE.GroomComponent.StaticClass()) ||
             this.followsHeadPose(part, R.head(component)) &&
             (!playing || part.bEnableSimulation !== false && part.bSuspendSimulation !== true)));
    }
    settleNativeHair(component, row, cloth, record, changed) {
        const head = R.head(component);
        let parts = this.nativeParts(component, row, cloth);
        // A saved outfit may return an empty or under-hat array even though
        // the visual hat slots are empty. Repair only that native layer.
        if (parts.cards.includes(undefined)) {
            component.BP_RefreshHeadCloth(cloth);
            parts = this.nativeParts(component, row, cloth);
        }
        if (parts.strands.some(part => !part)) {
            component.RefreshGroomComponents(head, row.GroomDataArray);
            parts = this.nativeParts(component, row, cloth);
        }
        const high = parts.strands.length && UE.KismetSystemLibrary.GetConsoleVariableIntValue("r.HairStrands.MainHairMode") === 1;
        const playing = this.isLivePlayer(component);
        for (const part of high ? parts.strands : parts.cards) {
            if (!part) continue;
            if (part.bHiddenInGame) part.SetHiddenInGame(false, false);
            if (!part.bVisible) part.SetVisibility(true, false);
        }
        if (!record.clothAssets) record.clothAssets = new Map();
        const active = new Map();
        for (const part of parts.cards) {
            if (!part) continue;
            const asset = part.GetClothAsset();
            active.set(part, asset);
            // The native slot is reused by the game. A changed asset needs a
            // fresh world-space solver pose, even if the component is visible.
            const missingLeader = !this.followsHeadPose(part, head);
            if (missingLeader) part.SetLeaderPoseComponent(head, true, false);
            const suspended = playing && !high && (part.bEnableSimulation === false || part.bSuspendSimulation === true);
            if (changed || missingLeader || suspended || record.clothAssets.get(part) !== asset) {
                if (suspended && part.bEnableSimulation === false) part.SetEnableSimulation(true);
                if (suspended && part.bSuspendSimulation === true) part.ResumeSimulation();
                part.ForceNextUpdateTeleportAndReset();
            }
        }
        record.clothAssets = active;
    }
    finishPreview(view, component) {
        const record = this.records.get(component);
        if (!record?.modified) return;
        const gm = view.getPreviewGameMode();
        if (!gm || gm.getActivePreviewDoll() !== record.owner) return;
        if (view.previewPhase !== 0 || record.owner.bHidden || !R.valid(record.head) ||
            !record.head.IsVisible() || record.head.bHiddenInGame) {
            record.previewSync = true;
            return;
        }
        const row = UE.PBZAppearanceComponent.GetAppearanceStruct(record.row);
        const {strands} = this.nativeParts(component, row, component.GetEffectiveHeadClothData(row));
        const clipped = strands.some(part => {
            if (!part?.GetIsHairLengthScaleEnabled()) return false;
            const groups = part.GroomGroupsDesc;
            for (let i = 0; i < groups.Num(); i++) {
                const desc = groups.Get(i);
                if (desc.HairLengthScale_Override && desc.HairLengthScale <= 0) return true;
            }
            return false;
        });
        if (!record.previewSync && record.previewView === view && !clipped) return;
        gm.setPreviewDollTick(record.owner, true);
        UE.PBZAppearancePreviewLibrary.UpdateActorGroomDissolve(record.owner, 0, false);
        record.previewView = view;
        record.previewSync = false;
    }
    apply(component) {
        if (!R.valid(component) || this.retiredPreviews.has(component) || this.previewBusy(component)) return;
        const record = this.record(component);
        if (!record || !this.scope.active) return;
        if (component.ShouldForceDefaultAppearance()) {
            this.restore(component);
            return;
        }
        this.bindSequenceHead(component, record);
        const head = R.head(component);
        // Do not claim a successful hairstyle change while native meshes are
        // still being created; the next normal tick retries on the same actor.
        if (!R.valid(head)) return;
        const headMesh = head.GetSkeletalMeshAsset();
        if (!R.valid(headMesh)) return;
        const native = this.nativeRow(component);
        if (!native) return;
        const choice = C.normalize(this.preview.get(component) || this.settings.choice);
        Hats.apply(component, record, native, choice.hat);
        const extraHair = !!C.styles.find(x => x.id === choice.style && x.parts);
        const nativeOverride = choice.style !== "outfit" && !extraHair;
        if (!nativeOverride) this.restoreHairDecals(record);
        const leavingExtraHair = !extraHair && !!this.accessories.records.get(component)?.hair;
        const desired = C.rowFor(choice, native.row, native.sequence), observed = String(component.EquipHairStyleItem);
        const row = UE.PBZAppearanceComponent.GetAppearanceStruct(desired);
        if (row.AppearanceType !== UE.EAppearanceType.Hairstyle || !UE.KismetSystemLibrary.IsValidSoftObjectReference(row.HeadAsset)) throw new Error("Native hairstyle row is invalid: " + desired);
        const ownsFace = this.faces.records.has(component);
        const atelierOwnsHat = compat.atelierOwnsHat(native.outfit, component);
        const actualHatOff = Hats.isOff(component, native.outfit);
        const atelierHatOff = atelierOwnsHat && actualHatOff;
        const atelierHatChanged = record.atelierHatOff !== undefined && record.atelierHatOff !== atelierHatOff;
        const manageNative = !extraHair && (nativeOverride || leavingExtraHair || record.modified ||
            choice.hat === "none" && !!record.hatOverride || atelierHatOff || atelierHatChanged);
        const hatOff = !extraHair && actualHatOff;
        const cloth = this.nativeCloth(component, row, hatOff && manageNative);
        const checkVisibility = !extraHair && (manageNative || ownsFace) && head.IsVisible() && !record.owner.bHidden && !head.bHiddenInGame && (hatOff || nativeOverride && !native.sequence && cloth.Num() > 0);
        const incomplete = (manageNative || choice.style !== "outfit" || (ownsFace && choice.face !== "outfit")) && !this.hairReady(component, row, checkVisibility, nativeOverride ? record : undefined, cloth);
        const rebuilt = record.head && (record.head !== head || record.headMesh !== headMesh);
        const changed = extraHair && incomplete || leavingExtraHair || extraHair && rebuilt || (!extraHair && atelierHatChanged) || (nativeOverride || record.modified) && (rebuilt || record.dirty || record.row !== desired || record.outfit !== native.outfit || record.observed !== observed || record.modified !== nativeOverride);
        if (record.target !== desired || atelierHatChanged) { record.target = desired; record.retryAt = 0; record.retryDelay = 120; }
        record.atelierHatOff = atelierHatOff;
        if ((changed || incomplete) && Date.now() >= record.retryAt) {
            record.dirty = true; record.retryAt = Date.now() + record.retryDelay;
            record.retryDelay = Math.min(record.retryDelay * 2, 2000);
            this.preloadHair(row);
            if (changed || !manageNative) {
                this.dyes.restoreComponent(component);
                this.accessories.beforeNativeRefresh(component);
                if (leavingExtraHair) this.accessories.releaseReplacementHair(component);
                this.restoreHairDecals(record);
                this.eyes.restore(R.head(component));
                const previous = this.faces.records.get(component);
                if (previous) this.eyes.restore(previous.face);
                this.faces.restoreNativeSkin(component);
                component.ReplaceHairStyle(desired, true, false);
            }
            record.row = desired; record.outfit = native.outfit; record.observed = String(component.EquipHairStyleItem);
            record.modified = nativeOverride;
            if (nativeOverride && native.wardrobePreview) record.previewSync = true;
            if (checkVisibility && manageNative) this.settleNativeHair(component, row, cloth, record, changed);
            const ready = this.hairReady(component, row, checkVisibility, nativeOverride ? record : undefined, cloth);
            record.dirty = false;
            if (nativeOverride && record.hairStatus !== desired + ":" + ready + ":" + hatOff) {
                record.hairStatus = desired + ":" + ready + ":" + hatOff;
                this.scope.log("SOUL-HAIR " + JSON.stringify({ row: desired, owner: R.path(record.owner), cloth: cloth.Num(), grooms: row.GroomDataArray.Num(), hatOff, ready }));
            }
            if (ready) { record.retryDelay = 120; record.retryAt = Date.now() + 60; }
        }
        const outfitHair = UE.PBZAppearanceComponent.GetAppearanceStruct(C.rowFor(C.defaults, native.row, native.sequence));
        const face = C.faces.find(x => x.id === choice.face);
        const path = face.mesh || UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(outfitHair.HeadAsset);
        const previousFace = this.faces.records.get(component);
        if (previousFace && previousFace.path !== path) this.eyes.restore(previousFace.face);
        if (previousFace && choice.style === "outfit" && choice.face === "outfit") this.eyes.restore(previousFace.face);
        const fill = this.playerFill.activeFor(component) ? this.playerFill : undefined;
        const visibleHead = this.faces.apply(component, path, choice.style !== "outfit" || choice.face !== "outfit", choice.face, fill);
        const glow = this.settings.glow;
        this.eyes.apply(visibleHead, choice.eye, choice.sclera, glow.enabled ? "on" : "off", glow.level);
        this.accessories.apply(component, choice, row, visibleHead, native.outfit, String(native.row.OutfitMeshBandItem), !!record.hatOverride, atelierOwnsHat ? actualHatOff : undefined);
        const groups = this.accessories.records.get(component);
        const nativeHair = groups?.hair ? null : this.nativeParts(component, row, cloth);
        const targets = groups?.hair ? groups.hair.parts : [...nativeHair.cards, ...nativeHair.strands].filter(Boolean);
        const beard = groups?.mask?.spec.id === "wwm_beard" ? groups.mask.parts : [];
        if (groups?.hair?.coverage && groups.hair.dyed !== (choice.color !== "native")) {
            groups.hair.coverage.restore();
            groups.hair.dyed = choice.color !== "native";
        }
        const family = C.hairFamily(groups?.hair?.spec.id);
        this.dyes.apply(component, choice.color, targets, family, groups?.hair?.spec);
        this.dyes.apply(component, choice.color, beard, "beard");
        this.dyes.prune();
        if (groups?.hair?.coverage) this.scope.safe("photo hair coverage", () => groups.hair.coverage.update(head));
        if (groups?.hair?.crown) {
            const material = groups.hair.parts[0].GetMaterial(0);
            if (groups.hair.crown.child.GetMaterial(0) !== material) groups.hair.crown.child.SetMaterial(0, material);
        }
        record.head = R.head(component); record.headMesh = record.head.GetSkeletalMeshAsset();
    }
    previewChoice(component, choice, hatIntent = false) {
        if (!C.validChoice(choice)) throw new Error("Invalid preview choice");
        this.preview.set(component, C.normalize(choice));
        if (hatIntent) this.previewHatIntent.add(component); else this.previewHatIntent.delete(component);
        this.apply(component);
    }
    clearPreview(component) {
        this.preview.delete(component); this.previewHatIntent.delete(component);
        if (R.valid(component)) this.apply(component);
    }
    commit(choice, resetColors = false) {
        if (!C.validChoice(choice)) throw new Error("Invalid committed choice");
        const saved = this.settings.save(choice, resetColors);
        for (const component of this.records.keys()) if (!this.preview.has(component)) this.scope.safe("apply selection", () => this.apply(component));
        return saved;
    }
    tick() {
        if (!this.scope.active) return;
        const player = UE.PBZAppearanceComponent.GetPBZAppearanceComponent(R.gi());
        this.scope.safe("gameplay face lighting", () => this.playerFill.update(player, this.settings.fillIntensity));
        if (R.valid(player)) this.scope.safe("player hair", () => this.apply(player));
        if (Date.now() >= this.scanAt) {
            this.scanAt = Date.now() + 250;
            for (const view of this.previewViews.keys()) if (!R.valid(view) || !view.IsVisible() || view.inputBarSuspended === true) this.clearPreviewView(view);
            const out = P.$ref();
            UE.GameplayStatics.GetAllActorsOfClass(R.gi(), this.sequenceClass, out);
            const a = P.$unref(out);
            for (let i = 0; i < a.Num(); i++) { const actor = a.Get(i); if (R.valid(actor)) this.record(actor.GetComponentByClass(UE.PBZAppearanceComponent.StaticClass())); }
        }
        for (const [component, r] of this.records) {
            if (!R.valid(component) || !R.valid(r.owner)) { this.restoreHairDecals(r); this.accessories.restore(component); this.faces.restore(component); this.releaseBindings(component, r); this.records.delete(component); this.preview.delete(component); this.previewHatIntent.delete(component); continue; }
            if (component !== player) this.scope.safe("preview/sequence hair", () => this.apply(component));
        }
        this.dyes.prune();
    }
    restore(component) {
        this.dyes.restoreComponent(component);
        const extraHair = !!this.accessories.records.get(component)?.hair;
        this.accessories.restore(component);
        const face = this.faces.records.get(component);
        this.eyes.restore(face ? face.face : R.head(component)); this.faces.restore(component);
        const record = this.records.get(component), native = R.valid(component) ? this.nativeRow(component) : null;
        if (record && native) Hats.release(component, record, native);
        if (record) this.restoreHairDecals(record);
        if (record && (record.modified || extraHair) && native) {
            const row = C.rowFor(C.defaults, native.row, native.sequence);
            component.ReplaceHairStyle(row, true, false);
            record.row = ""; record.modified = false; record.dirty = false;
        }
    }
    stop() {
        this.preview.clear(); this.previewHatIntent = new WeakSet();
        for (const [component, record] of this.records) if (R.valid(component)) {
            for (const [name, fn] of record.delegates) this.scope.safe("remove appearance listener", () => component[name].Remove(fn));
            this.scope.safe("restore hairstyle", () => this.restore(component));
            this.scope.safe("restore cinematic mesh bindings", () => this.releaseBindings(component, record));
        }
        this.accessories.stop(); this.eyes.stop(); this.faces.stop(); this.dyes.stop(); this.records.clear(); this.hairAssets.clear(); this.previewViews.clear();
    }
}
exports.Appearance = Appearance;
