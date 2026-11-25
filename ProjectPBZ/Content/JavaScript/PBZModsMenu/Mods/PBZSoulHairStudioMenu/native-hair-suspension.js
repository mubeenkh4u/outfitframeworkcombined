"use strict";
const UE = require("ue"), R = require("./runtime");
const WWM = new Set(["wwm_long", "wwm_longknot", "wwm_ponytail", "wwm_short", "wwm_longstraight", "wwm_luxurystraight", "wwm_wavylocks"]);
const GROOM_SOLVERS = new Set([
    "/hairstrands/emitters/stablespringssystem.stablespringssystem",
    "/hairstrands/emitters/stablerodssystem.stablerodssystem"
]);

function asset(part, cloth) { return cloth ? part.GetClothAsset() : part.GroomAsset; }
function same(record, part, state) {
    return R.valid(part) && part.GetOwner() === record.owner && asset(part, state.cloth) === state.asset;
}
function releaseSolvers(part, state, owner) {
    let resumed = false;
    for (const [solver, source] of state.solvers) {
        if (R.valid(solver) && solver.GetOwner() === owner && solver.GetAttachParent() === part && solver.GetAsset() === source && solver.IsPaused()) {
            solver.SetPaused(false); resumed = true;
        }
    }
    state.solvers.clear();
    if (resumed && typeof part.ResetSimulation === "function") part.ResetSimulation();
    if (state.suspended) {
        // Resume clears our suspension flag; it does not re-enable externally
        // disabled cloth. Reset only on return to native hair, never on WWM.
        part.ResumeSimulation(); state.suspended = false;
        if (part.IsSimulationEnabled()) part.ForceNextUpdateTeleportAndReset();
    }
}
function release(record, part, state) {
    if (!R.valid(part) || part.GetOwner() !== record.owner || part.GetAttachParent() !== record.head) return;
    const original = same(record, part, state);
    releaseSolvers(part, state, record.owner);
    if (original && state.visible && !part.IsVisible()) part.SetVisibility(true, false);
}
exports.restore = function (record) {
    for (const [part, state] of record.hidden) release(record, part, state);
    record.hidden.clear();
};
exports.suppress = function (record, component, row) {
    if (!R.valid(record.head) || record.head.GetOwner() !== record.owner || component.GetOwner() !== record.owner) return;
    const groomPaths = new Set(), clothPaths = new Set();
    for (let i = 0; i < row.GroomDataArray.Num(); i++) {
        const path = UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(row.GroomDataArray.Get(i).GroomAsset);
        if (!/Brow|Lash/i.test(path)) groomPaths.add(path.toLowerCase());
    }
    const cloth = component.GetEffectiveHeadClothData(row);
    for (let i = 0; i < cloth.Num(); i++) clothPaths.add(UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(cloth.Get(i).ClothAsset).toLowerCase());
    const children = R.children(record.head), selected = new Set();
    const pause = WWM.has(record.hair?.spec.id);
    for (const part of children) {
        if (!R.valid(part) || part.GetOwner() !== record.owner || part.GetAttachParent() !== record.head) continue;
        const isCloth = part.IsA(UE.ChaosClothComponent.StaticClass());
        if (!isCloth && !part.IsA(UE.GroomComponent.StaticClass())) continue;
        const source = asset(part, isCloth);
        if (!R.valid(source)) continue;
        if (!(isCloth ? clothPaths : groomPaths).has(R.path(source).toLowerCase())) continue;
        // Never pause the replacement, even if a malformed native row lists it.
        if (record.hair?.parts.includes(part)) continue;
        selected.add(part);
        let state = record.hidden.get(part);
        if (state && !same(record, part, state)) { release(record, part, state); record.hidden.delete(part); state = null; }
        if (!state) {
            state = { asset: source, cloth: isCloth, visible: part.IsVisible(), suspended: false, solvers: new Map() };
            record.hidden.set(part, state);
        }
        if (part.IsVisible()) part.SetVisibility(false, false);
        if (!pause) { releaseSolvers(part, state, record.owner); continue; }
        if (isCloth) {
            if (typeof part.IsSimulationSuspended === "function" && part.IsSimulationEnabled() && !part.IsSimulationSuspended()) {
                part.SuspendSimulation(); state.suspended = true;
            }
        } else if (UE.NiagaraComponent) {
            // Groom physics is stepped by NiagaraWorldManager, not by the
            // groom's component tick. Pause only its two known UE solvers.
            for (const solver of children) {
                if (!R.valid(solver) || solver.GetOwner() !== record.owner || !solver.IsA(UE.NiagaraComponent.StaticClass()) || solver.GetAttachParent() !== part) continue;
                const system = solver.GetAsset();
                if (state.solvers.has(solver) && state.solvers.get(solver) !== system) state.solvers.delete(solver);
                if (!GROOM_SOLVERS.has(R.path(system).toLowerCase()) || !solver.IsActive() || solver.IsPaused()) continue;
                solver.SetPaused(true); state.solvers.set(solver, system);
            }
            for (const solver of state.solvers.keys()) if (!R.valid(solver)) state.solvers.delete(solver);
        }
    }
    // Refreshes can remove a native component or reuse it with another asset.
    for (const [part, state] of record.hidden) if (!selected.has(part)) {
        release(record, part, state); record.hidden.delete(part);
    }
};
