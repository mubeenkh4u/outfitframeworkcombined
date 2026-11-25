"use strict";
// Owned WWM cloth inertia. The continuous limits are being tested on the player's Penglai only.
const ASSETS = Object.freeze({"wwm_long":"Long","wwm_longknot":"LongKnot","wwm_ponytail":"Ponytail","wwm_short":"Short","wwm_longstraight":"B2_LongStraight","wwm_luxurystraight":"B2_LuxuryStraight","wwm_wavylocks":"B2_WavyLocks"});
const WWM_ASSET_FOLDER = "/Game/PBZMods/SoulHairStudio/WWM";
// Chaos applies radians per second, radians per second squared, and a scale
// on the residual angular velocity used for centrifugal forces.
const PENGLAI_LIMITS = Object.freeze({ acceleration: 48, fictitious: .18, velocity: 4.5 });
const HOLD = .12, RELEASE = .18, REARM = .25, REST_SPEED = 2;
class OnsetWindow {
    constructor(stationary = true) { this.reset(stationary); }
    reset(stationary = false) {
        this.armed = stationary; this.rest = stationary ? REARM : 0; this.age = null;
    }
    step(dt, oldSpeed, speed, acceleration) {
        if (![dt, oldSpeed, speed, acceleration].every(Number.isFinite) || dt <= 0 || dt > .15) {
            this.reset(); return 0;
        }
        if (this.age === null && this.armed && oldSpeed <= REST_SPEED && (speed > REST_SPEED || acceleration > 1)) {
            this.age = 0; this.armed = false; this.rest = 0;
        }
        if (this.age !== null) {
            const age = this.age; this.age += dt;
            if (age >= HOLD + RELEASE - 1e-7) { this.age = null; return 0; }
            if (age <= HOLD) return 1;
            const t = Math.min(1, (age - HOLD) / RELEASE);
            return 1 - t * t * (3 - 2 * t);
        }
        if (speed <= REST_SPEED && acceleration <= 1) {
            this.rest += dt; if (this.rest >= REARM) this.armed = true;
        } else { this.rest = 0; this.armed = false; }
        return 0;
    }
}
function parameters(weight, baselineAcceleration, baselineFictitious) {
    if (weight <= 0) return [baselineAcceleration, baselineFictitious];
    // Ease the finite acceleration limit out; never interpolate to FLT_MAX.
    return [Math.min(baselineAcceleration, 8 / (weight * weight)), baselineFictitious * (1 - weight)];
}
const horizontal = v => Math.hypot(v.X, v.Y);
function attach(scope, group) {
    const suffix = ASSETS[group.spec.id];
    if (!suffix) return null;
    const UE = require("ue"), R = require("./runtime"), owner = group.owner;
    // Static preview actors have no locomotion onset. Keep their baseline physics.
    if (!owner.IsA(UE.Character.StaticClass())) return null;
    const movement = owner.CharacterMovement, event = owner.OnCharacterMovementUpdated;
    if (!R.valid(movement) || typeof movement.GetCurrentAcceleration !== "function" ||
        !event || typeof event.Add !== "function" || typeof event.Remove !== "function") throw new Error("WWM movement-update contract unavailable");
    const parts = [...group.cloth];
    const cloth = parts[0];
    if (parts.length !== 1) throw new Error("Unexpected WWM cloth identity");
    const assetPath = R.path(cloth.GetClothAsset());
    const stem = "CA_WWM_" + suffix;
    const assetSuffix = `/${stem}.${stem}`;
    if (!assetPath.endsWith(assetSuffix)) throw new Error("Unexpected WWM cloth identity");
    const interactor = cloth.GetClothOutfitInteractor(0, "None");
    if (!R.valid(interactor) || !interactor.IsA(UE.ChaosClothAssetInteractor.StaticClass())) throw new Error("WWM cloth interactor unavailable");
    const original = [interactor.GetFloatPropertyValue("MaxAngularAcceleration", 0, -1), interactor.GetFloatPropertyValue("FictitiousAngularScale", 0, -1)];
    if (!(original[0] > 1e30) || Math.abs(original[1] - 1) > 1e-6) throw new Error("WWM accepted inertia asset mismatch");
    const names = ["MaxAngularAcceleration", "FictitiousAngularScale"];
    const previous = original.slice();
    const gi = assetPath === WWM_ASSET_FOLDER + assetSuffix && typeof R.gi === "function" ? R.gi() : null;
    const localWwm = R.valid(gi) && UE.GameplayStatics.GetPlayerPawn(gi, 0) === owner;
    let baseline = original, stopped = false;
    const state = new OnsetWindow(horizontal(owner.GetVelocity()) <= REST_SPEED);
    function apply(values, verify = false) {
        for (let i = 0; i < names.length; i++) if (values[i] !== previous[i]) {
            const name = names[i], value = values[i];
            // A native write may throw after taking effect. Keep the attempted
            // value so restoration always visits it.
            previous[i] = value;
            interactor.SetFloatPropertyValue(name, -1, value);
            if (verify) {
                const actual = interactor.GetFloatPropertyValue(name, 0, -1);
                if (!Number.isFinite(actual) || Math.abs(actual - value) > Math.max(1, value) * 1e-6) {
                    throw new Error("Penglai inertia property did not bind: " + name);
                }
            }
        }
    }
    function restore(values = original) {
        if (R.valid(cloth) && cloth.GetOwner() === owner && R.valid(interactor)) apply(values);
    }
    function stop() {
        if (stopped) return; stopped = true;
        try { if (R.valid(owner)) event.Remove(onMovement); }
        finally {
            try { restore(); }
            finally { if (R.valid(cloth) && R.valid(movement)) cloth.RemoveTickPrerequisiteComponent(movement); }
        }
    }
    function onMovement(dt, oldLocation, oldVelocity) {
        if (stopped) return;
        try {
            if (!scope.active || !R.valid(owner) || !R.valid(cloth) || !R.valid(interactor)) { stop(); return; }
            if (!group.showing || group.perfHidden || !cloth.IsSimulationEnabled() || cloth.IsSimulationSuspended()) {
                restore(baseline); state.reset(horizontal(owner.GetVelocity()) <= REST_SPEED);
                return;
            }
            const velocity = owner.GetVelocity(), acceleration = movement.GetCurrentAcceleration();
            const weight = state.step(dt, horizontal(oldVelocity), horizontal(velocity), horizontal(acceleration));
            if (baseline === original) apply(parameters(weight, ...original));
            else apply([
                baseline[0] + (8 - baseline[0]) * weight,
                baseline[1] * (1 - weight),
                baseline[2]
            ]);
        } catch (error) {
            scope.report("WWM onset protection", error);
            scope.safe("restore WWM baseline inertia", stop);
        }
    }
    if (localWwm && group.spec.id === "wwm_long") {
        const velocity = interactor.GetFloatPropertyValue("MaxAngularVelocity", 0, -1);
        if (!(velocity > 1e30)) scope.log("WWM-INERTIA wwm_long skipped: unexpected MaxAngularVelocity");
        else {
            names.push("MaxAngularVelocity");
            original.push(velocity);
            previous.push(velocity);
            const { acceleration, fictitious, velocity: limit } = PENGLAI_LIMITS;
            try {
                apply([acceleration, fictitious, limit], true);
                baseline = [acceleration, fictitious, limit];
            } catch (error) {
                apply(original, true);
                names.pop(); original.pop(); previous.pop();
                scope.report("Penglai continuous inertia limits", error);
            }
            if (baseline !== original) scope.log(`WWM-INERTIA wwm_long angular velocity=${limit} acceleration=${acceleration} fictitious=${fictitious}`);
        }
    }
    // Movement event fires after UpdateComponentVelocity, before this dependent
    // cloth tick. No simulation resets, global CVars, or polling timer.
    cloth.AddTickPrerequisiteComponent(movement);
    try { event.Add(onMovement); } catch (error) { stop(); throw error; }
    const restored = baseline === original ? "baseline" : "steady limits";
    scope.log(`WWM-ONSET ${group.spec.id} enabled; hold=0.12s release=0.18s; ${restored} restored outside onset`);
    return { stop, localWwm };
}
exports.OnsetWindow = OnsetWindow;
exports.parameters = parameters;
exports.attach = attach;
exports.PENGLAI_LIMITS = PENGLAI_LIMITS;
