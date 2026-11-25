"use strict";
// Shared compatibility state, loaded by both original Mods Menu entries.
// No engine objects are retained here beyond the registered providers.
function createCompatibility() {
    const outfitId = "pbz_outfit_acateliesoul";
    const sources = { atelier: null, studio: null };
    const isAtelier = outfit => String(outfit || "").toLowerCase() === outfitId;
    function register(name, api) {
        if (sources[name]) throw new Error("[PBZ Combined] " + name + " is already registered");
        sources[name] = api;
        return () => { if (sources[name] === api) sources[name] = null; };
    }
    function atelierOwnsHat(outfit, component, committedOnly = false) {
        if (!isAtelier(outfit) || !sources.atelier) return false;
        if (!sources.studio) return true;
        if (!committedOnly && sources.studio.previewHat(component)) return false;
        return sources.atelier.controller() !== "Studio";
    }
    return {
        isAtelier,
        registerAtelier: api => register("atelier", api),
        registerStudio: api => register("studio", api),
        atelierOwnsHat,
        atelierHatRow(outfit, component) {
            return atelierOwnsHat(outfit, component, true) ? sources.atelier.hatRow() : undefined;
        },
        claimStudioHat(outfit) {
            if (!isAtelier(outfit) || !sources.atelier || !sources.studio) return false;
            return sources.atelier.claimStudioHat();
        },
        studioPreviewPage() { return sources.studio?.previewPage() || null; },
        releaseAtelierHat(component, outfit) {
            if (isAtelier(outfit) && !atelierOwnsHat(outfit, component)) sources.atelier?.releaseHat(component);
        },
        releaseStudioHat(component, outfit) {
            if (atelierOwnsHat(outfit, component)) sources.studio?.releaseHat(component, outfit);
        },
        studioHasHat(component) { return !!sources.studio?.hasHat(component); }
    };
}
const key = "__PBZCombinedOutfitCompatibility_v1";
module.exports = globalThis[key] ||= createCompatibility();
