"use strict";
// Shared compatibility state, loaded by both original Mods Menu entries.
// No engine objects are retained here beyond the registered providers.
function createCompatibility() {
    const outfitId = "pbz_outfit_acateliesoul";
    const sources = { atelier: null, studio: null };
    // A native Appearance widget is shared by three logical pages. Reserve it
    // before any native callback, not only after the custom grid has been built.
    const menus = new WeakMap();
    let menuSerial = 0;
    const report = (where, error) => console.warn("[PBZ Combined UI] " + where + ": " + error);
    function reserveStudioMenu(view, tab) {
        if (!view) throw new Error("Missing native appearance widget");
        const token = { view, tab: String(tab), generation: ++menuSerial };
        menus.set(view, token);
        try { sources.atelier?.suspendMenu?.(view); } catch (error) { report("suspend Atelier", error); }
        return token;
    }
    function releaseStudioMenu(token) {
        if (!token || menus.get(token.view) !== token) return false;
        menus.delete(token.view);
        return true;
    }
    function studioOwnsMenu(view) { return !!view && menus.has(view); }
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
        reserveStudioMenu, releaseStudioMenu, studioOwnsMenu,
        studioMenuTab(view) { return view ? menus.get(view)?.tab : undefined; },
        studioRegistered() { return !!sources.studio; },
        beforeNativeMenuClose(view) {
            try { sources.atelier?.suspendMenu?.(view); } catch (error) { report("close Atelier", error); }
        },
        afterNativeInputRefresh(view) {
            if (studioOwnsMenu(view)) return;
            try { sources.atelier?.nativeInputRefreshed?.(view); } catch (error) { report("refresh Atelier input", error); }
        },
        atelierOwnsHat,
        atelierHatRow(outfit, component) {
            return atelierOwnsHat(outfit, component, true) ? sources.atelier.hatRow() : undefined;
        },
        claimStudioHat(outfit) {
            if (!isAtelier(outfit) || !sources.atelier || !sources.studio) return false;
            return sources.atelier.claimStudioHat();
        },
        claimAtelierHat(outfit) {
            if (!isAtelier(outfit) || !sources.atelier) return false;
            return sources.atelier.claimAtelierHat();
        },
        notifyBodyChanged(component) { sources.studio?.bodyChanged?.(component); },
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
const key = "__PBZCombinedOutfitCompatibility_v3";
module.exports = globalThis[key] ||= createCompatibility();
