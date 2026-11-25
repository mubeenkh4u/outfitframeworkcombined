"use strict";
const UE = require("ue"), R = require("./runtime"), C = require("./catalog");
const styles = new Map([
    ["wwm_longstraight", "B2_LongStraight"], ["wwm_luxurystraight", "B2_LuxuryStraight"],
    ["wwm_wavylocks", "B2_WavyLocks"], ["wwm_ponytail", "Ponytail"], ["wwm_longknot", "LongKnot"]
]);
const meshes = new Map(C.faces.filter(face => face.mesh).map(face =>
    [face.mesh.toLowerCase(), face.id === "young" ? "Young" : "Soul"]));

exports.release = function (group) {
    const child = group.crown?.child;
    if (R.valid(child) && child.GetOwner() === group.owner) child.K2_DestroyComponent(group.owner);
    group.crown = null;
};

exports.update = function (accessories, group, head, show) {
    if (!styles.has(group.spec.id)) return;
    const part = group.parts[0], mid = part.GetMaterial(0);
    if (!R.valid(head) || !R.valid(mid) || head.GetOwner() !== group.owner) { exports.release(group); return; }
    const headMesh = head.GetSkeletalMeshAsset();
    let state = group.crown;
    if (!state || !R.valid(state.child) || state.head !== head || state.headMesh !== headMesh || state.child.GetAttachParent() !== head) {
        exports.release(group);
        const variant = meshes.get(R.path(headMesh).toLowerCase());
        if (!variant || head.GetBoneIndex("head") < 0) return;
        const name = "SM_WWM_Crown40_" + variant + "_" + styles.get(group.spec.id);
        const asset = accessories.load("/Game/PBZMods/SoulHairStudio/WWM/" + name + "." + name, "StaticMesh");
        const identity = UE.KismetMathLibrary.MakeTransform(R.vector(0, 0, 0), new UE.Rotator(), R.vector(1, 1, 1));
        const child = group.owner.AddComponentByClass(UE.StaticMeshComponent.StaticClass(), true, identity, false);
        if (!R.valid(child) || child.GetOwner() !== group.owner) throw new Error("WWM crown component unavailable");
        state = group.crown = { child, head, headMesh };
        try {
            child.SetVisibility(false, false);
            child.SetCollisionEnabled(UE.ECollisionEnabled.NoCollision);
            child.SetReceivesDecals(false);
            child.SetCastShadow(false);
            child.K2_AttachToComponent(head, "head", UE.EAttachmentRule.KeepRelative, UE.EAttachmentRule.KeepRelative, UE.EAttachmentRule.KeepRelative, false);
            if (child.GetAttachParent() !== head || !child.SetStaticMesh(asset)) throw new Error("WWM crown attachment failed");
        } catch (error) { exports.release(group); throw error; }
    }
    const child = state.child;
    // The same MID follows all hair dyes and damage states without a second dye pass.
    if (child.GetMaterial(0) !== mid) child.SetMaterial(0, mid);
    const light = part.LightingChannels, current = child.LightingChannels;
    if (light && current && (current.bChannel0 !== light.bChannel0 || current.bChannel1 !== light.bChannel1 || current.bChannel2 !== light.bChannel2))
        child.SetLightingChannels(light.bChannel0, light.bChannel1, light.bChannel2);
    const visible = show && part.IsVisible() && !part.bHiddenInGame;
    if (child.IsVisible() !== visible) child.SetVisibility(visible, false);
};
