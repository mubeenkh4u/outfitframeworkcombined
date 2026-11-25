"use strict";
const UE = require("ue"), R = require("./runtime"), C = require("./catalog");
const conical = new Set(C.hats.map(item => item.id));
const compat = require("./combined-compat");

// The stock blueprint binds separate components for socketed and skinned hats.
// Its BP_ReplaceHat and BP_ReplaceHatSkin both delegate to SetMeshAsset.
function ownedSlot(component, name) {
    const slot = component[name];
    return R.valid(slot) && slot.GetOwner() === component.GetOwner() && slot.IsA(UE.SkeletalMeshComponent.StaticClass()) ? slot : null;
}

exports.isOff = function (component, outfit) {
    if (component.bAppliedHatVisible === false) return true;
    const slots = ["Hun Hat", "Hun Hat01"].map(name => ownedSlot(component, name)).filter(Boolean);
    if (slots.length) return !slots.some(slot => R.valid(slot.GetSkeletalMeshAsset()) && slot.IsVisible() && !slot.bHiddenInGame);
    return typeof component.bAppliedHatVisible === "boolean" ? !component.bAppliedHatVisible : component.IsHatHiddenForOutfit(outfit);
};

function resolveHat(id) {
    if (!id || id.toLowerCase() === "none") return { id, mesh: null, skinned: false };
    const row = UE.PBZAppearanceComponent.GetAppearanceStruct(id);
    if (row.AppearanceType !== UE.EAppearanceType.Hat || !UE.KismetSystemLibrary.IsValidSoftObjectReference(row.HatAsset))
        throw new Error("Invalid native hat row: " + id);
    const mesh = UE.KismetSystemLibrary.LoadAsset_Blocking(row.HatAsset);
    if (!R.valid(mesh) || !mesh.IsA(UE.SkeletalMesh.StaticClass())) throw new Error("Native hat mesh unavailable: " + id);
    return { id, mesh, skinned: row.bHatUseSkinComponent };
}

function setMesh(component, slot, mesh) {
    if ((slot.GetSkeletalMeshAsset() || null) === mesh) return;
    if (mesh) component.SetMeshAsset(mesh, slot);
    else slot.SetSkeletalMeshAsset(null);
}

exports.release = function (component, record, native) {
    if (record?.hatOverride) applyNative(component, record, native, "outfit");
};
exports.apply = function (component, record, native, selection) {
    if (compat.atelierOwnsHat(native.outfit, component)) {
        exports.release(component, record, native);
        return;
    }
    compat.releaseAtelierHat(component, native.outfit);
    return applyNative(component, record, native, selection);
};
function applyNative(component, record, native, selection) {
    const original = String(native.row.OutfitHatItem || "None");
    // Removing a conical hat on a hooded outfit returns its own hood.
    const override = conical.has(selection) || selection === "none" && conical.has(original);
    if (!override && !record.hatOverride) return;
    const rigid = ownedSlot(component, "Hun Hat"), skin = ownedSlot(component, "Hun Hat01");
    if (!override && record.hatOverride) {
        // Never restore over a replacement already installed by the game or another mod.
        const slots = [rigid, skin].filter(Boolean);
        if (!slots.length) return;
        const owned = record.hatOverride.mesh;
        const current = slots.map(slot => slot.GetSkeletalMeshAsset() || null);
        if (current.some(mesh => mesh && mesh !== owned)) {
            record.hatOverride = null;
            return;
        }
    }
    const id = override ? selection : original;
    const spec = record.hatOverride?.id === id ? record.hatOverride : resolveHat(id);
    const active = spec.skinned ? skin : rigid, other = spec.skinned ? rigid : skin;
    if (spec.mesh && !active || !rigid && !skin) return;
    if (!record.hatOverride || record.hatOutfit !== native.outfit || component.bAppliedHatVisible !== record.hatShown) {
        record.hatNativeVisible = component.bAppliedHatVisible;
        record.hatOutfit = native.outfit;
    }
    let show = !!spec.mesh;
    if (!override) {
        const player = UE.PBZAppearanceComponent.GetPBZAppearanceComponent(R.gi());
        show = R.valid(player) && (component === player || native.wardrobePreview)
            ? !player.IsHatHiddenForOutfit(native.outfit) : record.hatNativeVisible;
    }
    record.hatOverride = spec; // A partial native write can be retried or restored.
    if (other) setMesh(component, other, null);
    if (active) setMesh(component, active, spec.mesh);
    // The visual-only native call also selects the hat-on/off head cloth.
    // The outfit and its persisted visibility override are never written here.
    record.hatShown = show;
    if (component.bAppliedHatVisible !== show) component.ApplyHatVisibilityVisual(show);
    // Each slot normally shares the same native hidden flag. The unused slot is empty.
    for (const slot of [rigid, skin]) if (slot && slot.bHiddenInGame !== !show) slot.SetHiddenInGame(!show, false);
    if (!override) record.hatOverride = null;
};
