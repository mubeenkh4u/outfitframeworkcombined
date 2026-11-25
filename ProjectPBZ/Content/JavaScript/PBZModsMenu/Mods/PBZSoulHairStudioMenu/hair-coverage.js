"use strict";
// Photo close-ups only. Keep the texture mask and every physics property intact.
const UE = require("ue"), C = require("./catalog"), R = require("./runtime");
const STYLES = new Set(["wwm_longknot", "wwm_ponytail", "wwm_short", "wwm_longstraight", "wwm_luxurystraight", "wwm_wavylocks"]);
const EDGE = "EdgeMaskMin", CLOSE = "DensityOffsetPower | Close";

function closeWeight(depth, fov, aspect, detailDistance) {
    if (![depth, fov, aspect, detailDistance].every(Number.isFinite) || depth <= 0 || fov <= 0 || fov >= 179 || aspect <= 0 || detailDistance <= 0) return 0;
    // The native shader uses reciprocal full FOV angles in radians (View
    // uniform register 146), not reciprocal projection-matrix coefficients.
    const horizontal = fov * Math.PI / 180;
    const vertical = 2 * Math.atan(Math.tan(horizontal / 2) / aspect);
    const threshold = detailDistance * Math.hypot(1 / horizontal, 1 / vertical);
    const t = Math.max(0, Math.min(1, (depth - threshold) / threshold));
    return 1 - t * t * (3 - 2 * t);
}

function photoView(group, head) {
    const gi = R.gi(), controller = UE.GameplayStatics.GetPlayerController(gi, 0);
    if (!R.valid(controller) || UE.GameplayStatics.GetPlayerPawn(gi, 0) !== group.owner || !UE.GameplayStatics.IsGamePaused(gi)) return null;
    const camera = controller.GetViewTarget(), manager = controller.PlayerCameraManager;
    // Soul Cinematic Studio creates an exact native CineCameraActor owned by
    // the local controller. Preview dolls, normal gameplay and story cameras
    // do not acquire this override. No other mod's private globals are read.
    if (!R.valid(camera) || !R.valid(manager) || camera.GetOwner() !== controller || R.path(camera.GetClass()) !== "/Script/CinematicCamera.CineCameraActor") return null;
    const pov = manager.CameraCachePrivate.POV, origin = manager.GetCameraLocation(), rotation = manager.GetCameraRotation();
    const point = head.GetSocketLocation("head"), yaw = rotation.Yaw * Math.PI / 180, pitch = rotation.Pitch * Math.PI / 180;
    const depth = (point.X - origin.X) * Math.cos(pitch) * Math.cos(yaw) + (point.Y - origin.Y) * Math.cos(pitch) * Math.sin(yaw) + (point.Z - origin.Z) * Math.sin(pitch);
    return { depth, fov: manager.GetFOVAngle(), aspect: pov.AspectRatio };
}

class Coverage {
    constructor(group) { this.group = group; this.records = new Map(); }
    restore() {
        for (const [mid, row] of this.records) if (R.valid(mid)) {
            for (const name of [EDGE, CLOSE]) {
                // Do not overwrite a value changed by another owner.
                if (Math.abs(mid.K2_GetScalarParameterValue(name) - row.applied[name]) < 1e-6 && row.applied[name] !== row.before[name]) mid.SetScalarParameterValue(name, row.before[name]);
            }
        }
        this.records.clear();
    }
    update(head) {
        const group = this.group;
        if (!group.showing || !R.valid(head) || !R.valid(group.owner)) { this.restore(); return; }
        const view = photoView(group, head);
        if (!view) { this.restore(); return; }
        const seen = new Set();
        for (const part of group.parts) {
            if (!R.valid(part) || part.GetOwner() !== group.owner) continue;
            for (let slot = 0; slot < part.GetNumMaterials(); slot++) {
                const mid = part.GetMaterial(slot);
                if (seen.has(mid)) continue;
                seen.add(mid);
                if (!R.valid(mid) || !mid.IsA(UE.MaterialInstanceDynamic.StaticClass()) || !R.path(mid).split(".").pop().startsWith(C.ID + "WWMHairCards")) continue;
                if (R.path(mid.Parent) !== C.wwmBaseMaterial || R.path(mid.Parent.Parent) !== C.wwmMasterMaterial) continue;
                let row = this.records.get(mid);
                const detail = mid.K2_GetScalarParameterValue("DetailDistance");
                const weight = closeWeight(view.depth, view.fov, view.aspect, detail);
                if (!row && weight === 0) continue;
                if (!row) {
                    const before = { [EDGE]: mid.K2_GetScalarParameterValue(EDGE), [CLOSE]: mid.K2_GetScalarParameterValue(CLOSE) };
                    const far = mid.K2_GetScalarParameterValue("DensityOffsetPower");
                    if (!Object.values(before).every(Number.isFinite) || before[EDGE] < 0 || before[EDGE] > 1 || before[CLOSE] <= 0 || !Number.isFinite(far) || far <= 0 || far > before[CLOSE]) throw new Error("Unexpected native WWM photo coverage parameters");
                    row = { before, applied: { ...before }, far }; this.records.set(mid, row);
                }
                const next = { [EDGE]: weight === 0 ? row.before[EDGE] : row.before[EDGE] + (1 - row.before[EDGE]) * weight,
                    [CLOSE]: weight === 0 ? row.before[CLOSE] : row.before[CLOSE] + (row.far - row.before[CLOSE]) * weight };
                for (const name of [EDGE, CLOSE]) if (Math.abs(next[name] - row.applied[name]) > 1e-7) {
                    mid.SetScalarParameterValue(name, next[name]);
                    row.applied[name] = next[name];
                    if (Math.abs(mid.K2_GetScalarParameterValue(name) - next[name]) > 1e-6) throw new Error("Photo hair coverage did not apply: " + name);
                }
                if (weight === 0) this.records.delete(mid);
            }
        }
        for (const mid of this.records.keys()) if (!seen.has(mid) || !R.valid(mid)) {
            const row = this.records.get(mid);
            if (R.valid(mid)) for (const name of [EDGE, CLOSE]) if (Math.abs(mid.K2_GetScalarParameterValue(name) - row.applied[name]) < 1e-6) mid.SetScalarParameterValue(name, row.before[name]);
            this.records.delete(mid);
        }
    }
}
exports.closeWeight = closeWeight;
exports.attach = group => STYLES.has(group.spec.id) && group.spec.wwmAuthored ? new Coverage(group) : null;
