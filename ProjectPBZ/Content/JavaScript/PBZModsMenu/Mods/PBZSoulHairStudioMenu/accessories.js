// WWM_BATCH2_NATIVE_MATERIALS: owned native MIDs, accepted WWM collisions, fixed jaw-bound beard.
"use strict";
const UE = require("ue"), P = require("puerts"), C = require("./catalog"), R = require("./runtime");
const SPEC = require("./cosmetics");
// Existing global parameters of native MA_HairSheet. Keep the original maps
// and shading; remove extra subpixel coverage/depth noise on owned hair cards.
const HAIR_CARD_STABILITY = { AlphaMipBias: 0, MaxOpacity: 1, PixelDepthOffset: 0, PixelDepthOffset_Root: 0, RootDitherRange: 0, TipDitherRange: 0 };
const SOUL_CARD_LIGHT_RESPONSE = { Brightness: .66, Roughness: .50, Specular: .095, Scatter: .28 };
const NATIVE_STYLE_BANDS = {
    default: "MeshBand_Default", motian: "MeshBand_MoTian", yayu: "MeshBand_YaYu",
    guyou: "MeshBand_GuYou", zhuiming: "MeshBand_ZhuiMing", fengxue: "MeshBand_FengXue", moqu: "MeshBand_Default"
};
// 0.65 degrees around the mask's upper edge, converted to Soul's head-bone space.
const MOYUAN_SOUL_FIT = { translation: [-.0764499, .1415, 0], rotation: [0, 0, -.0056723, .9999839], scale: [1, 1, 1] };
// The native MoTian mask samples layer 0; dissolve is blend 0.
// Name-only setters create global overrides that do not replace those slots.
function batch2Parameter(spec, name) {
    if (!spec.batch2Materials || spec.wwmAuthored) return null;
    const association = ["Albedo", "Normal", "Mix", "Albedo Controls", "Normal Strength", "Roughness Min", "Roughness Max", "Roughness Exponent", "Metallic Min", "Metallic Max", "AO Min", "AO Exponent", "Specular", "BaseColor To Specular", "BaseColor To Roughness", "Albedo Overlay", "AO Channel", "Roughness Channel", "Metallic Channel"].includes(name) ? "LayerParameter" :
        ["Dissolve_BoundMaskWeight", "Dissolve_ExtraDissolve"].includes(name) ? "BlendParameter" : null;
    if (!association) throw new Error("Unknown WWM accessory material parameter: " + name);
    const info = new UE.MaterialParameterInfo();
    info.Name = name; info.Association = UE.EMaterialParameterAssociation[association]; info.Index = 0;
    return info;
}
function setBatch2Parameter(mid, spec, type, name, value) {
    const info = batch2Parameter(spec, name);
    mid["Set" + type + "ParameterValue" + (info ? "ByInfo" : "")](info || name, value);
}
function getBatch2Parameter(mid, spec, type, name) {
    const info = batch2Parameter(spec, name);
    return mid["K2_Get" + type + "ParameterValue" + (info ? "ByInfo" : "")](info || name);
}
function transform(spec) {
    const q = new UE.Quat(); [q.X, q.Y, q.Z, q.W] = spec.rotation;
    return UE.KismetMathLibrary.MakeTransform(R.vector(...spec.translation), UE.KismetMathLibrary.Quat_Rotator(q), R.vector(...spec.scale));
}
function targetProfile(head) {
    const mesh = R.path(head.GetSkeletalMeshAsset());
    const face = C.faces.find(x => x.mesh && x.mesh.toLowerCase() === mesh.toLowerCase());
    if (!face || !SPEC.profiles[face.id]) throw new Error("Unsupported accessory target head: " + mesh);
    return SPEC.profiles[face.id];
}
class Accessories {
    constructor(scope) { this.scope = scope; this.records = new Map(); this.bands = new Map(); this.assets = new Map(); }
    load(path, type) {
        const cls = UE[type]; let asset = this.assets.get(path);
        if (!R.valid(asset)) {
            asset = cls.Load(path);
            if (!R.valid(asset) || R.path(asset).toLowerCase() !== path.toLowerCase() || !asset.IsA(cls.StaticClass())) throw new Error("Original accessory resource unavailable: " + path);
            this.assets.set(path, asset);
        }
        return asset;
    }
    destroyGroup(group) {
        if (!group) return;
        if (group.crown) require("./crown").release(group);
        if (group.coverage) { this.scope.safe("restore photo hair coverage", () => group.coverage.restore()); group.coverage = null; }
        if (group.onset) { this.scope.safe("stop Pengshan onset protection", () => group.onset.stop()); group.onset = null; }
        for (const part of [...group.parts, group.anchor]) if (R.valid(part) && part.GetOwner() === group.owner) {
            if (group.cloth.has(part)) { part.SuspendSimulation(); part.SetEnableSimulation(false); part.ResetCollisionSources(); }
            part.K2_DestroyComponent(group.owner);
        }
    }
    restoreHair(record) { require("./native-hair-suspension").restore(record); }
    releaseReplacementHair(component) {
        const record = this.records.get(component);
        if (!record?.hair) return;
        this.restoreHair(record);
        this.destroyGroup(record.hair);
        record.hair = null;
    }
    restore(component) {
        this.restoreBand(component);
        const r = this.records.get(component); if (!r) return;
        this.restoreHair(r); this.destroyGroup(r.hair); this.destroyGroup(r.mask); this.records.delete(component);
    }
    validGroup(group, head) {
        return group && R.valid(group.anchor) && group.anchor.GetAttachParent() === head && group.parts.every(x => R.valid(x) && x.GetOwner() === group.owner && x.GetAttachParent() === group.anchor);
    }
    createGroup(component, head, spec) {
        const owner = component.GetOwner();
        if (head.GetBoneIndex("head") < 0) throw new Error("Native head attachment bone unavailable");
        const expansion = !spec.nativeNPC && spec.expansionCards;
        const penglai = spec.id === "wwm_long" && spec.wwmAuthored;
        const usesSoulHairMaterial = !!(spec.wwmAuthored || expansion);
        const materialName = C.ID + (expansion ? "ExpansionHairCards" : spec.wwmAuthored ? "WWMHairCards" : "HairCards");
        // Resolve and type-check the entire group before touching the old look.
        const inputs = spec.parts.map(part => ({ part, mesh: this.load(part.mesh, part.type === "static" ? "StaticMesh" : part.type === "cloth" ? "ChaosClothAsset" : "SkeletalMesh"), materials: (part.materials || []).map(path => this.load(usesSoulHairMaterial && !penglai ? C.wwmBaseMaterial : path, "MaterialInterface")) }));
        const identity = UE.KismetMathLibrary.MakeTransform(R.vector(0, 0, 0), new UE.Rotator(), R.vector(1, 1, 1));
        const group = { owner, anchor: null, parts: [], cloth: new Set(), collisions: new Map(), showing: false, spec, profile: "" };
        try {
            group.anchor = owner.AddComponentByClass(UE.SceneComponent.StaticClass(), true, identity, false);
            if (!R.valid(group.anchor) || group.anchor.GetOwner() !== owner) throw new Error("Accessory anchor creation failed");
            const socket = spec.nativePhysics || spec.fixedSkinnedBeard ? "None" : "head";
            group.anchor.K2_AttachToComponent(head, socket, UE.EAttachmentRule.KeepRelative, UE.EAttachmentRule.KeepRelative, UE.EAttachmentRule.KeepRelative, false);
            for (const { part, mesh, materials } of inputs) {
                const type = part.type === "static" ? UE.StaticMeshComponent : part.type === "cloth" ? UE.ChaosClothComponent : UE.SkeletalMeshComponent;
                const child = owner.AddComponentByClass(type.StaticClass(), true, identity, false);
                if (!R.valid(child) || child.GetOwner() !== owner) throw new Error("Accessory mesh component creation failed");
                group.parts.push(child); child.SetVisibility(false, false);
                child.SetReceivesDecals(false);
                if (child.bReceivesDecals !== false) throw new Error("Accessory decal opt-out did not apply");
                child.SetCollisionEnabled(UE.ECollisionEnabled.NoCollision);
                if (usesSoulHairMaterial) {
                    // Set only this newly owned component, before binding its
                    // asset. Never change the game's global renderer settings.
                    const cache = child.SkinCacheUsage;
                    if (!cache || typeof cache.Empty !== "function" || typeof cache.Add !== "function" || !UE.ESkinCacheUsage || UE.ESkinCacheUsage.Enabled !== 1) throw new Error("Native SkinCacheUsage contract unavailable");
                    cache.Empty(); cache.Add(UE.ESkinCacheUsage.Enabled);
                    if (expansion) for (let lod = 1; lod < 4; lod++) cache.Add(UE.ESkinCacheUsage.Enabled);
                }
                if (part.type === "static") {
                    if (!child.SetStaticMesh(mesh)) throw new Error("Original mask assignment failed");
                } else if (part.type === "cloth") {
                    group.cloth.add(child);
                    if (!spec.nativePhysics) throw new Error("Unreviewed non-native hair physics");
                    // Fitted cloth is in Soul component space and follows the full bone pose.
                    child.SetEnableSimulation(false);
                    child.bUseAttachedParentAsPoseComponent = false;
                    child.bBindToLeaderComponent = false;
                    child.SetClothAsset(mesh);
                    if (child.GetClothAsset() !== mesh) throw new Error("Artist hair cloth assignment failed");
                    if (expansion && (materials.length !== 1 || child.GetNumMaterials() !== 4)) throw new Error("Expansion hair LOD material slots unavailable");
                    child.AddTickPrerequisiteComponent(head);
                } else {
                    child.SetSkeletalMeshAsset(mesh);
                    if (spec.fixedSkinnedBeard) {
                        if (spec.id !== "wwm_beard" || part.type !== "skeletal" || child.GetSkeletalMeshAsset() !== mesh || head.GetBoneIndex("FACIAL_C_Jaw") < 0) throw new Error("Fixed beard skeletal contract unavailable");
                        child.SetRenderStatic(false);
                        child.AddTickPrerequisiteComponent(head);
                    } else child.SetRenderStatic(true);
                }
                materials.forEach((material, slot) => {
                    if (spec.nativeNPC) {
                        for (let i = 0; i < child.GetNumMaterials(); i++) child.SetMaterial(i, material);
                        return;
                    }
                    child.SetMaterial(slot, material);
                    if (!C.styles.some(style => style.id === spec.id && style.parts) && !spec.batch2Materials && spec.id !== "wwm_beard") return;
                    const mid = child.CreateDynamicMaterialInstance(slot, material, materialName);
                    if (!R.valid(mid) || !mid.IsA(UE.MaterialInstanceDynamic.StaticClass())) throw new Error("Owned native hair material creation failed");
                    // Start with the shared stable hair-card profile, then
                    // apply the source-specific fade and response overrides.
                    const scalars = spec.batch2Materials && !usesSoulHairMaterial ? spec.batch2Materials.scalars : {
                        ...HAIR_CARD_STABILITY,
                        ...(expansion ? SOUL_CARD_LIGHT_RESPONSE : spec.wwmAuthored ? { HairAOStrength: 0 } : {}),
                        ...expansion?.scalars,
                        ...spec.batch2Materials?.scalars
                    };
                    for (const [name, value] of Object.entries(scalars)) {
                        setBatch2Parameter(mid, spec, "Scalar", name, value);
                        if (Math.abs(getBatch2Parameter(mid, spec, "Scalar", name) - value) > 1e-6) throw new Error("Native hair parameter did not apply: " + name);
                    }
                    if (expansion?.colors || spec.batch2Materials?.vectors) {
                        for (const [name, color] of Object.entries(expansion?.colors || spec.batch2Materials.vectors)) {
                            setBatch2Parameter(mid, spec, "Vector", name, R.rgba(color.slice(0, 3), color[3]));
                            const applied = getBatch2Parameter(mid, spec, "Vector", name);
                            if ([applied.R, applied.G, applied.B, applied.A].some((value, index) => Math.abs(value - color[index]) > 1e-6)) {
                                throw new Error("Original hair color did not bind: " + name);
                            }
                        }
                    }
                    // Create a MID from the actual shipped Soul material. Let
                    // UE build its runtime parameter cache for the new maps;
                    // never use a serialized clone as the rendering parent.
                    const textureOverrides = spec.batch2Materials?.textures || expansion?.textures ||
                        (spec.fixedSkinnedBeard ? C.wwmBeardTextures : {});
                    for (const [name, path] of Object.entries(textureOverrides)) {
                        const bind = source => {
                            const texture = this.load(source, "Texture2D");
                            setBatch2Parameter(mid, spec, "Texture", name, texture);
                            if (getBatch2Parameter(mid, spec, "Texture", name) !== texture) throw new Error("WWM runtime texture binding failed: " + name);
                        };
                        try { bind(path); }
                        catch (error) {
                            if (name !== "Diffuse" || expansion || spec.wwmAuthored) throw error;
                            bind(C.paths.white);
                            this.scope.log("WWM-DIFFUSE using native white: " + spec.id);
                        }
                    }
                    if (spec.wwmAuthored && C.wardrobeHairColors[spec.id]) {
                        const tint = R.rgba(C.linear(C.wardrobeHairColors[spec.id]));
                        const dye = C.wwmHairDye(spec);
                        mid.SetTextureParameterValue("Diffuse", this.load(dye.atlas, "Texture2D"));
                        mid.SetScalarParameterValue("Brightness", dye.brightness);
                        mid.SetVectorParameterValue("RootColor", tint);
                        mid.SetVectorParameterValue("TipColor", tint);
                    }
                    if (expansion) {
                        // Cloth render patterns use a distinct slot per LOD.
                        // Bind one owned MID to all slots so dye and texture
                        // state follow the render section as the camera moves.
                        for (let lod = 1; lod < child.GetNumMaterials(); lod++) {
                            child.SetMaterial(lod, mid);
                            if (child.GetMaterial(lod) !== mid) throw new Error("Expansion hair material did not bind for LOD " + lod);
                        }
                    }
                });
                child.K2_AttachToComponent(group.anchor, "None", UE.EAttachmentRule.KeepRelative, UE.EAttachmentRule.KeepRelative, UE.EAttachmentRule.KeepRelative, false);
                child.K2_SetRelativeTransform(transform(part.transform), false, P.$ref(new UE.HitResult()), true);
                if (part.type === "cloth" || spec.fixedSkinnedBeard) {
                    child.SetLeaderPoseComponent(head, true, false);
                }
            }
            if (!this.validGroup(group, head)) throw new Error("Native accessory attachment did not bind");
            if (expansion) {
                const child = group.parts[0], mid = child.GetMaterial(0);
                this.scope.log("EXPANSION-HAIR " + JSON.stringify({
                    id: spec.id, owner: R.path(owner), mesh: R.path(child.GetClothAsset()), material: R.path(mid.Parent),
                    alpha: R.path(mid.K2_GetTextureParameterValue("Alpha(NoVT)")),
                    diffuse: R.path(mid.K2_GetTextureParameterValue("Diffuse")), skinCache: child.SkinCacheUsage.Get(0)
                }));
            }
            if (spec.wwmAuthored) {
                for (const child of group.parts) {
                    const mid = child.GetMaterial(0);
                    const names = ["Alpha(NoVT)", "Normal_map", "Diffuse", "Root"];
                    const textures = Object.fromEntries(names.map(name => [name, R.path(getBatch2Parameter(mid, spec, "Texture", name))]));
                    this.scope.log("WWM-MATERIAL created " + JSON.stringify({ id: spec.id, owner: R.path(owner), mesh: R.path(spec.fixedSkinnedBeard ? child.GetSkeletalMeshAsset() : child.GetClothAsset()), material: R.path(mid.Parent), textures, forcedLodModel: child.ForcedLodModel, skinCache: Array.from({ length: child.SkinCacheUsage.Num() }, (_, i) => child.SkinCacheUsage.Get(i)), opaque: false, simulationRequested: !spec.fixedSkinnedBeard }));
                }
            }
            if (spec.wwmAuthored) group.onset = require("./hair-onset").attach(this.scope, group);
            group.coverage = require("./hair-coverage").attach(group);
            return group;
        } catch (error) { this.destroyGroup(group); throw error; }
    }
    fit(group, visibleHead, mask) {
        const key = R.path(visibleHead.GetSkeletalMeshAsset());
        if (group.profile === key) return;
        const target = targetProfile(visibleHead);
        if (group.spec.artistAligned) {
            // Artist transforms already use Soul's head space. Applying the
            // former inferred head-size scale here would undo the hand fit.
            const fitted = group.spec.id === "moyuan" && target === SPEC.profiles.soul
                ? transform(MOYUAN_SOUL_FIT)
                : UE.KismetMathLibrary.MakeTransform(R.vector(0, 0, 0), new UE.Rotator(), R.vector(1, 1, 1));
            group.anchor.K2_SetRelativeTransform(fitted, false, P.$ref(new UE.HitResult()), true);
            group.profile = key; return;
        }
        const source = group.spec.sourceProfile, margin = group.spec.fitScale || (mask ? 1 : 1.02);
        const scale = [target.height / source.height, target.depth / source.depth, target.width / source.width].map(x => x * margin);
        if (!scale.every(x => Number.isFinite(x) && x > .4 && x < 1.8)) throw new Error("Accessory calibration is outside the reviewed range");
        // Separate head-space scaling from the child's inverse source pose. The
        // two native transforms avoid approximating a sheared matrix.
        const offset = [0, target.centerY - source.centerY * scale[1] + (mask ? .35 : 0), target.centerZ - source.centerZ * scale[2]];
        group.anchor.K2_SetRelativeTransform(UE.KismetMathLibrary.MakeTransform(R.vector(...offset), new UE.Rotator(), R.vector(...scale)), false, P.$ref(new UE.HitResult()), true);
        group.profile = key;
    }
    suppressHair(record, component, row) { require("./native-hair-suspension").suppress(record, component, row); }
    applyBand(component, style, outfitBand, extraHair) {
        const band = component["Mesh Band"];
        const target = NATIVE_STYLE_BANDS[style];
        // Climax and Default use the same shipped band mesh.
        const equipped = outfitBand === "MeshBand_Climax" ? "MeshBand_Default" : outfitBand;
        const mismatched = target && target !== equipped && Object.values(NATIVE_STYLE_BANDS).includes(equipped);
        if ((!extraHair && !mismatched) || (this.bands.has(component) && this.bands.get(component) !== band)) this.restoreBand(component);
        if (!extraHair && !mismatched) return;
        if (R.valid(band) && band.IsA(UE.SkeletalMeshComponent.StaticClass()) && band.GetOwner() === component.GetOwner() && band.IsVisible()) {
            band.SetVisibility(false, false); this.bands.set(component, band);
        }
    }
    restoreBand(component) {
        const band = this.bands.get(component);
        this.bands.delete(component);
        if (R.valid(band) && !band.IsVisible()) band.SetVisibility(true, false);
    }
    syncCollisions(group, component) {
        if (!group.cloth.size) return;
        const next = new Map();
        const forearms = group.spec.wwmAuthored && !group.spec.externalOutfitPhysics;
        const luxuryLegs = group.spec.id === "wwm_luxurystraight";
        const useForearms = forearms && !group.onset?.localWwm;
        // Equipped WWM hair avoids forearm capsules driven by the body mesh's
        // separate turn pose. Luxury still needs the original leg capsules.
        const sources = forearms
            ? (useForearms || luxuryLegs ? [component.BodyComponent] : [])
            : [component.BodyComponent, component["Mesh Scarf"]];
        for (const source of sources) {
            if (!R.valid(source) || !source.IsA(UE.SkeletalMeshComponent.StaticClass()) || source.GetOwner() !== group.owner) continue;
            if (forearms) {
                if (useForearms && (source.GetBoneIndex("lowerarm_l") < 0 || source.GetBoneIndex("lowerarm_r") < 0)) continue;
                if (luxuryLegs && ["thigh_l", "thigh_r", "calf_l", "calf_r"].some(bone => source.GetBoneIndex(bone) < 0)) continue;
                const name = luxuryLegs
                    ? (useForearms ? "PA_CA_WWM_B2_LuxuryContact" : "PA_CA_WWM_B2_LuxuryLegs133")
                    : "PA_CA_WWM_Long_Forearms";
                next.set(source, this.load(`/Game/PBZMods/SoulHairStudio/WWM/${name}.${name}`, "PhysicsAsset"));
                continue;
            }
            // The component's C++ GetPhysicsAsset is not a reflected JS method.
            // Match its precedence through reflected object properties instead.
            const mesh = source.GetSkeletalMeshAsset();
            const physics = R.valid(source.PhysicsAssetOverride) ? source.PhysicsAssetOverride : R.valid(mesh) && mesh.IsA(UE.SkeletalMesh.StaticClass()) ? mesh.PhysicsAsset : null;
            if (!R.valid(physics)) continue;
            const path = R.path(physics);
            if (!physics.IsA(UE.PhysicsAsset.StaticClass()) || !/^\/(?:HuaShira\/Characters\/(?:Hero|Outfits)\/|Game\/PBZContent\/Characters\/(?:Hero|Outfits)\/)/i.test(path)) throw new Error("Unreviewed native outfit physics: " + path);
            if (group.spec.nativeNPC) {
                // Use the current body pose with the matching NPC-owned collision shapes.
                const ownedPhysics = C.npcOutfitCollision[path];
                if (!ownedPhysics) throw new Error("Unreviewed NPC hair collision source: " + path);
                next.set(source, this.load(ownedPhysics, "PhysicsAsset"));
            } else next.set(source, physics);
        }
        for (const [source, physics] of group.collisions) if (next.get(source) !== physics) for (const part of group.cloth) {
            part.RemoveCollisionSource(source, physics); part.RemoveTickPrerequisiteComponent(source);
        }
        for (const [source, physics] of next) if (group.collisions.get(source) !== physics) for (const part of group.cloth) {
            part.AddCollisionSource(source, physics, true); part.AddTickPrerequisiteComponent(source);
        }
        group.collisions = next;
    }
    apply(component, choice, row, visibleHead, outfit, outfitBand, independentHat, actualHatOff) {
        if (!this.scope.active) return;
        const head = R.head(component), mesh = R.valid(head) ? head.GetSkeletalMeshAsset() : null;
        if (!R.valid(head) || !R.valid(mesh) || !R.valid(visibleHead)) return;
        let r = this.records.get(component);
        if (r && (r.head !== head || r.mesh !== mesh)) { this.restore(component); r = null; }
        const style = C.styles.find(x => x.id === choice.style && x.parts), mask = C.masks.find(x => x.id === choice.mask && x.parts);
        if (!r && !style && !mask) { this.applyBand(component, choice.style, outfitBand, false); return; }
        if (!r) { r = { head, mesh, owner: component.GetOwner(), hair: null, mask: null, hidden: new Map(), retry: {} }; this.records.set(component, r); }
        for (const [kind, spec] of [["hair", style], ["mask", mask]]) {
            const old = r[kind];
            if (!spec) { if (kind === "hair") this.restoreHair(r); this.destroyGroup(old); r[kind] = null; continue; }
            if (!old || old.spec.id !== spec.id || !this.validGroup(old, head)) {
                let retry = r.retry[kind];
                if (!retry || retry.id !== spec.id) retry = r.retry[kind] = { id: spec.id, at: 0, delay: 120 };
                if (Date.now() < retry.at) continue;
                let next;
                try { next = this.createGroup(component, head, spec); this.fit(next, visibleHead, kind === "mask"); }
                catch (error) { this.destroyGroup(next); retry.at = Date.now() + retry.delay; retry.delay = Math.min(retry.delay * 2, 2000); throw error; }
                if (kind === "hair") this.restoreHair(r);
                this.destroyGroup(old); r[kind] = next;
                delete r.retry[kind];
            }
            this.fit(r[kind], visibleHead, kind === "mask");
            if (kind === "hair") this.syncCollisions(r[kind], component);
        }
        if (r.hair) this.suppressHair(r, component, row);
        this.applyBand(component, choice.style, outfitBand, !!r.hair);
        // A visible hat does not universally hide native hair. Default/YaYu
        // retain a native under-hat cloth row, which the extra hair must follow.
        const baseVisible = head.IsVisible() && !head.bHiddenInGame && !component.GetOwner().bHidden;
        const hatHidden = actualHatOff === undefined ? component.IsHatHiddenForOutfit(outfit) : actualHatOff;
        const hairAllowed = independentHat || hatHidden || component.GetEffectiveHeadClothData(row).Num() > 0;
        for (const group of [r.hair, r.mask]) if (group) {
            // Masks are an independent selection, not native under-hat hair.
            const show = baseVisible && (group !== r.hair || hairAllowed);
            for (const part of group.parts) {
                if (part.IsVisible() !== show) part.SetVisibility(show, false);
                if (part.bHiddenInGame !== head.bHiddenInGame) part.SetHiddenInGame(head.bHiddenInGame, false);
                if (group.cloth.has(part) && group.showing !== show) {
                    if (group.spec.fixedPoseCloth) { part.SetEnableSimulation(false); }
                    else if (show) { part.SetEnableSimulation(true); part.ResumeSimulation(); part.ForceNextUpdateTeleportAndReset(); }
                    else part.SuspendSimulation();
                }
            }
            group.showing = show;
            if (group === r.hair && group.spec.wwmAuthored) require("./crown").update(this, group, visibleHead, show);
        }
        if (!r.hair && !r.mask && !style && !mask) this.records.delete(component);
    }
    beforeNativeRefresh(component) { this.restoreBand(component); const r = this.records.get(component); if (r) this.restoreHair(r); }
    stop() { for (const component of new Set([...this.records.keys(), ...this.bands.keys()])) this.scope.safe("restore native accessories", () => this.restore(component)); this.assets.clear(); }
}
exports.Accessories = Accessories;
