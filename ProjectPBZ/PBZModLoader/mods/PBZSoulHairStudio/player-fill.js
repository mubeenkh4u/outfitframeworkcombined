"use strict";

const UE = require("ue"), P = require("puerts"), R = require("./runtime"), C = require("./catalog");
const playerClasses = new Set(["BP_Renewal_Hun", "BP_Renewal_Hun_Young", "BP_Renewal_Hun_Climax"]
    .map(name => "/Game/RenewalContent/Actors/Players/" + name + "." + name + "_C"));
const headBone = "head";

function hasVisibleHat(component) {
    const outfit = component.GetEffectiveOutfit();
    if (!outfit || String(outfit).toLowerCase() === "none") return false;
    const row = UE.PBZAppearanceComponent.GetAppearanceStruct(outfit);
    const hat = String(row?.OutfitHatItem ?? "").toLowerCase();
    return !!hat && hat !== "none" && !component.IsHatHiddenForOutfit(outfit);
}

function setShadowFlags(light, casts, dynamic) {
    if (light.CastDynamicShadows !== dynamic) {
        // The reflected flag alone does not rebuild the light's render proxy.
        light.SetCastShadows(false);
        light.CastDynamicShadows = dynamic;
    }
    light.SetCastShadows(casts);
    if (light.CastShadows !== casts || light.CastDynamicShadows !== dynamic) throw new Error("Native fill shadow flags could not be changed");
}

function setFaceShadow(mesh, casts, dynamic) {
    if (mesh.bCastDynamicShadow !== dynamic) {
        mesh.SetCastShadow(false);
        mesh.bCastDynamicShadow = dynamic;
    }
    mesh.SetCastShadow(casts);
}

class PlayerFill {
    constructor(scope) {
        this.scope = scope;
        this.binding = null;
        this.caster = null;
        scope.cleanup(() => this.restore());
    }
    update(component, intensity = C.fillIntensity.default) {
        const owner = R.valid(component) ? component.GetOwner() : null;
        const head = R.valid(component) ? R.head(component) : null;
        const light = R.valid(owner) ? owner.SpotLight_CharacterOnly : null;
        const eligible = R.valid(owner) && playerClasses.has(R.path(owner.GetClass())) &&
            owner === UE.GameplayStatics.GetPlayerPawn(R.gi(), 0) && component.CurrentHunType === UE.EPBZHunType.NormalHun &&
            R.valid(head) && head.IsA(UE.SkeletalMeshComponent.StaticClass()) &&
            head.GetBoneIndex(headBone) >= 0 && head.GetBoneIndex("FACIAL_C_Nose") >= 0 &&
            R.valid(light) && light.IsA(UE.SpotLightComponent.StaticClass()) && light.GetOwner() === owner;
        if (this.binding && (!eligible || this.binding.head !== head || this.binding.light !== light || !this.activeFor(component))) this.restore();
        if (!eligible) return;
        const wearingHat = hasVisibleHat(component);
        if (this.binding) {
            try {
                this.setPose(wearingHat);
            } catch (error) {
                this.scope.safe("roll back gameplay fill pose", () => this.restore(true));
                throw error;
            }
            this.setIntensity(intensity);
            return;
        }

        const parent = owner.SpringArm, channels = light.LightingChannels;
        if (!R.valid(parent) || !parent.IsA(UE.SpringArmComponent.StaticClass()) || light.GetAttachParent() !== parent ||
            channels?.bChannel0 !== false || channels.bChannel1 !== true || channels.bChannel2 !== false ||
            typeof light.CastShadows !== "boolean" || typeof light.CastDynamicShadows !== "boolean" ||
            !Number.isFinite(light.SourceRadius) || !Number.isFinite(light.Intensity) || typeof light.SetIntensity !== "function") return;
        const binding = {
            component, light, head, parent, socket: String(light.GetAttachSocketName() ?? "None"), transform: light.GetRelativeTransform(),
            casts: light.CastShadows, dynamic: light.CastDynamicShadows, radius: light.SourceRadius,
            nativeIntensity: light.Intensity
        };
        this.binding = binding;
        try {
            const keep = UE.EAttachmentRule.KeepRelative;
            if (!light.K2_AttachToComponent(head, headBone, keep, keep, keep, false)) throw new Error("Cannot attach the native fill to the head");
            this.setPose(wearingHat);
            setShadowFlags(light, true, true);
            this.setIntensity(intensity);
            this.scope.log("gameplay fill attached to head; centered, dynamic shadows on; " + intensity + " cd");
        } catch (error) {
            this.scope.safe("roll back gameplay fill", () => this.restore(true));
            throw error;
        }
    }
    setPose(wearingHat) {
        const r = this.binding;
        if (r.wearingHat === wearingHat) return;
        const light = r.light;
        if (r.appliedRadius !== undefined && light.SourceRadius !== r.appliedRadius) r.radius = light.SourceRadius;
        // Adult and young rigs share head-local +X up and +Y forward. Aim at the nose.
        const target = R.vector(5.5, 9, 0);
        const degrees = wearingHat ? 10 : 25;
        const elevation = degrees * Math.PI / 180, distance = 150;
        const radius = wearingHat ? 15 : 10;
        const position = R.vector(target.X + distance * Math.sin(elevation), target.Y + distance * Math.cos(elevation), target.Z);
        const rotation = UE.KismetMathLibrary.FindLookAtRotation(position, target);
        light.K2_SetRelativeLocationAndRotation(position, rotation, false, P.$ref(new UE.HitResult()), true);
        light.SetSourceRadius(radius);
        if (light.SourceRadius !== radius) throw new Error("Native fill source radius could not be changed");
        r.appliedRadius = radius;
        r.wearingHat = wearingHat;
        this.scope.log("gameplay fill pose; elevation " + degrees + "°, source radius " + radius + " cm");
    }
    setIntensity(value) {
        const r = this.binding;
        if (!r || r.appliedIntensity === value || !this.activeFor(r.component)) return;
        const light = r.light;
        if (r.appliedIntensity !== undefined && light.Intensity !== r.appliedIntensity) r.nativeIntensity = light.Intensity;
        if (light.Intensity !== value) {
            light.SetIntensity(value);
            if (light.Intensity !== value) throw new Error("Native fill intensity could not be changed");
        }
        r.appliedIntensity = value;
    }
    activeFor(component) {
        const r = this.binding;
        return !!r && r.component === component && R.valid(r.light) && r.light.GetAttachParent() === r.head &&
            String(r.light.GetAttachSocketName()).toLowerCase() === headBone;
    }
    ownsCaster(mesh) { return this.caster?.mesh === mesh; }
    castFrom(mesh) {
        if (!R.valid(mesh) || this.ownsCaster(mesh)) return;
        this.scope.safe("enable face shadow caster", () => {
            this.restoreCaster();
            if (typeof mesh.CastShadow !== "boolean" || typeof mesh.bCastDynamicShadow !== "boolean") throw new Error("Native face shadow flags unavailable");
            this.caster = { mesh, casts: mesh.CastShadow, dynamic: mesh.bCastDynamicShadow };
            try {
                setFaceShadow(mesh, true, true);
                if (!mesh.CastShadow || !mesh.bCastDynamicShadow) throw new Error("Cannot enable dynamic shadows on the face");
            } catch (error) {
                this.scope.safe("roll back face shadows", () => this.restoreCaster(true));
                throw error;
            }
        });
    }
    restoreCaster(rollback = false) {
        const r = this.caster;
        this.caster = null;
        if (!r || !R.valid(r.mesh)) return;
        setFaceShadow(r.mesh, rollback || r.mesh.CastShadow ? r.casts : false,
            rollback || r.mesh.bCastDynamicShadow ? r.dynamic : false);
    }
    restore(rollback = false) {
        const binding = this.binding;
        this.binding = null;
        this.scope.safe("restore face shadow flags", () => this.restoreCaster());
        if (!binding || !R.valid(binding.light)) return;
        const { light, head, parent, socket, transform, casts, dynamic, radius } = binding;
        if (R.valid(parent) && light.GetAttachParent() === head && String(light.GetAttachSocketName()).toLowerCase() === headBone) {
            const keep = UE.EAttachmentRule.KeepRelative;
            if (!light.K2_AttachToComponent(parent, socket, keep, keep, keep, false)) throw new Error("Cannot restore the native fill attachment");
            light.K2_SetRelativeTransform(transform, false, P.$ref(new UE.HitResult()), true);
        }
        if (rollback || light.SourceRadius === binding.appliedRadius) light.SetSourceRadius(radius);
        if (rollback || light.Intensity === binding.appliedIntensity) light.SetIntensity(binding.nativeIntensity);
        setShadowFlags(light, rollback || light.CastShadows ? casts : false,
            rollback || light.CastDynamicShadows ? dynamic : false);
    }
}

exports.PlayerFill = PlayerFill;
