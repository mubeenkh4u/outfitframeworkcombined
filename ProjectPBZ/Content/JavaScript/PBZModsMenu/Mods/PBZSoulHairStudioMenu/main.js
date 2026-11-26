"use strict";
// Each loader has its own discoverable copy. Share one live instance per VM.
const currentInstance = globalThis.__PBZSoulHairStudioInstance;
if (currentInstance && currentInstance.active) {
    module.exports = currentInstance.exports;
} else {
const UE = require("ue"), P = require("puerts"), C = require("./catalog"), R = require("./runtime"), U = require("./ui");
const Native = require("./contract");
const compat = require("./combined-compat");
const Hats = require("./hats");
R.guard();
const scope = new R.Scope(), hosts = new Map(), settings = new R.Settings(scope);
const routes = new Map(), byView = new WeakMap(), routing = new Set(), initializing = new Set();
const knownHosts = new Map(), failedTabs = new WeakMap();
let handleTab, nativeTab, nextHostScan = 0;
let appearance;
exports.stop = () => scope.stop();
const instance = { active: true, exports };
globalThis.__PBZSoulHairStudioInstance = instance;
scope.cleanup(() => {
    exports.ready = false; instance.active = false;
    if (globalThis.__PBZSoulHairStudioInstance === instance) delete globalThis.__PBZSoulHairStudioInstance;
});
function validate(proto, name, file) {
    if (R.fingerprint(proto[name]) !== Native.methods[file][name]) throw new Error("Native source differs: " + file + ":" + name);
}
function patch(proto, name, file, classPath, wrapper) { scope.patch(proto, name, wrapper, Native.methods[file][name], classPath); }
function pageFor(view) {
    const route = byView.get(view), page = U.pageByView.get(view);
    return route?.phase === "active" && page?.active && page.hairMode && compat.studioOwnsMenu(view) ? page : null;
}
function customTab(id) {
    const key = String(id).toLowerCase();
    return [C.TAB, C.MASK_TAB].find(tab => tab.toLowerCase() === key);
}
function nativeReady(host, view) {
    return R.valid(host) && R.valid(view) && R.valid(host.WidgetSwitcher_31) &&
        host.WidgetSwitcher_31.GetActiveWidgetIndex() === 1 &&
        view.inputBarSuspended !== true && view.IsVisible() && R.valid(view.W_SystemPanel);
}
function detachRouteView(route, destroy = false) {
    const view = route.view, page = route.page;
    if (page) {
        scope.safe("leave shared wardrobe", () => page.leave());
        page.hairMode = false;
        if (destroy) {
            scope.safe("destroy shared wardrobe", () => page.stop());
            if (hosts.get(route.host) === page) hosts.set(route.host, null);
        }
    }
    if (view) {
        scope.safe("release preview context", () => appearance.clearPreviewView(view));
        if (byView.get(view) === route) byView.delete(view);
    }
    compat.releaseStudioMenu(route.token);
    route.view = null; route.token = null; route.page = null;
}
function closeRoute(host, destroy = false) {
    const route = routes.get(host);
    if (!route) return;
    routes.delete(host); route.phase = "closed";
    detachRouteView(route, destroy);
}
function attachRouteView(route) {
    const view = route.host.W_Appearance_V2;
    if (!R.valid(view)) return false;
    if (route.view === view && route.token) return true;
    if (route.view) detachRouteView(route, true);
    route.view = view; byView.set(view, route);
    route.token = compat.reserveStudioMenu(view, route.tab);
    return true;
}
function failRoute(route, error) {
    if (routes.get(route.host) !== route) return;
    scope.report("open " + route.tab + " menu", error);
    failedTabs.set(route.host, route.tab);
    closeRoute(route.host, true);
    // Do not leave a broken custom panel or a hidden native outfit list.
    scope.later(() => {
        const host = route.host;
        if (routes.has(host) || !R.valid(host) || !R.valid(host.TabList)) return;
        if (customTab(host.TabList.GetSelectedTabId())) host.TabList.SelectTabByID("Appearance", true);
    }, 0);
}
function openRoute(route) {
    if (routes.get(route.host) !== route || route.phase !== "pending" || routing.has(route.host) || initializing.has(route.view)) return;
    if (!attachRouteView(route) || !nativeReady(route.host, route.view)) return;
    route.phase = "opening";
    try {
        let page = hosts.get(route.host);
        if (page && page.view !== route.view) {
            scope.safe("destroy replaced wardrobe", () => page.stop()); page = null;
        }
        if (!page) {
            page = new U.HairPage(scope, appearance, settings, route.host, route.refreshLanguage);
            hosts.set(route.host, page);
        }
        route.page = page;
        page.setTab(route.tab); page.hairMode = true;
        page.open();
        route.phase = "active";
        route.host.W_SecondTabLine.InitDataByText(U.flow(C.message(C.tabMessage(route.tab), settings.language)));
        scope.log("[Combined UI] active " + route.tab);
    } catch (error) { failRoute(route, error); }
}
function pollRoutes() {
    const now = Date.now();
    // A host may have bound its original native callbacks before this loader
    // started. Discover existing widgets only when no live host is known.
    if (now >= nextHostScan) {
        nextHostScan = now + 1500;
        for (const host of knownHosts.keys()) if (!R.valid(host)) {
            knownHosts.delete(host); closeRoute(host, true); hosts.delete(host);
        }
        if (!knownHosts.size && UE.WidgetBlueprintLibrary?.GetAllWidgetsOfClass) scope.safe("discover existing character menu", () => {
            const ref = P.$ref(UE.NewArray(UE.UserWidget));
            UE.WidgetBlueprintLibrary.GetAllWidgetsOfClass(R.gi(), ref, R.loadClass(C.paths.host), false);
            const list = P.$unref(ref);
            for (let i = 0; i < list.Num(); ++i) {
                const host = list.Get(i);
                if (R.valid(host)) { knownHosts.set(host, 0); if (!hosts.has(host)) hosts.set(host, null); }
            }
        });
    }
    for (const [host, last] of knownHosts) {
        if (!R.valid(host)) { knownHosts.delete(host); closeRoute(host, true); hosts.delete(host); continue; }
        if (!R.valid(host.TabList) || typeof host.IsVisible === "function" && !host.IsVisible() || routing.has(host)) continue;
        if (now - last >= 1000) {
            knownHosts.set(host, now);
            if (!R.valid(host.TabList.GetTabButton(C.TAB)) || !R.valid(host.TabList.GetTabButton(C.MASK_TAB)))
                scope.safe("repair dynamic tab registration", () => U.registerTab(host, settings));
        }
        // Detect a real selected-tab change even when CommonUI invokes a cached
        // native delegate rather than the patched onTabSelected method.
        scope.safe("reconcile selected appearance tab", () => {
            const selected = String(host.TabList.GetSelectedTabId()), requested = customTab(selected), route = routes.get(host);
            if (requested && route?.tab !== requested && failedTabs.get(host) !== requested && handleTab && nativeTab) {
                scope.log("[Combined UI] recovered cached tab callback: " + requested);
                handleTab.call(host, nativeTab, requested);
            } else if (!requested && selected && selected.toLowerCase() !== "none" && route?.phase === "active" && !route.selectionMismatch) {
                closeRoute(host);
                if (selected.toLowerCase() === "appearance" && nativeReady(host, host.W_Appearance_V2)) {
                    const view = host.W_Appearance_V2;
                    scope.safe("restore outfit confirm after cached callback", () => view.refreshReplaceOutfitInputBar());
                    scope.safe("restore outfit hat input after cached callback", () => view.refreshHatInputBar());
                }
            }
        });
    }
    for (const [host, route] of routes) {
        if (!R.valid(host)) { closeRoute(host, true); hosts.delete(host); continue; }
        if (routing.has(host)) continue;
        if (typeof host.IsVisible === "function" && !host.IsVisible()) {
            closeRoute(host); continue;
        }
        if (route.phase === "active" && (host.W_Appearance_V2 !== route.view || !nativeReady(host, route.view))) {
            detachRouteView(route, true); route.phase = "pending"; route.started = Date.now();
        }
        if (route.phase === "pending") {
            if (Date.now() - route.started > 8000) { failRoute(route, new Error("Native Appearance did not become ready")); continue; }
            openRoute(route);
        }
    }
}
try {
    const A = require("UI/Widget/Appearance").AppearanceMixinInterface.prototype;
    const H = require("UI/Widget/Character_V3").CharacterUI_V3MixinInterface.prototype;
    const B = require("UI/Widget/Button/ButtonBaseWeaponAppearance").ButtonBaseWeaponAppearanceInterface.prototype;
    const GM = require("Gameplay/GameModeBuild").GameModeBuildMixinInterface.prototype;
    for (const name of Native.requiredGameMode) validate(GM, name, "Gameplay_GameModeBuild");
    appearance = new (require("./appearance").Appearance)(scope, settings);
    const unregisterCompat = compat.registerStudio({
        previewHat(component) {
            return appearance.previewHatIntent.has(component);
        },
        previewPage() {
            let active = null;
            for (const [host, page] of hosts) if (R.valid(host) && page?.active && page.hairMode && R.valid(page.view) && page.view.IsVisible() && !page.view.inputBarSuspended) {
                if (active && active !== page.view) return null;
                active = page.view;
            }
            return active;
        },
        releaseHat(component) {
            if (!R.valid(component)) return;
            const record = appearance.records.get(component), native = appearance.nativeRow(component);
            if (record && native) Hats.release(component, record, native);
        },
        hasHat(component) { return !!appearance.records.get(component)?.hatOverride; },
        bodyChanged(component) {
            const record = appearance.records.get(component);
            if (record) { record.dirty = true; record.retryAt = 0; }
        }
    });
    scope.cleanup(unregisterCompat);
    function refreshLanguage() {
        for (const [host, page] of hosts) if (R.valid(host)) {
            U.refreshTab(host, settings);
            if (page) page.refreshLanguage();
            if (page && page.active) host.W_SecondTabLine.InitDataByText(U.flow(C.message(C.tabMessage(page.tab), settings.language)));
        }
    }
    function ensure(host) {
        knownHosts.set(host, Date.now());
        if (!hosts.has(host)) hosts.set(host, null);
        U.registerTab(host, settings);
    }
    for (const name of ["BP_FirstInitWidget", "BP_InitWidget"]) patch(H, name, "UI_Widget_Character_V3", C.paths.host, function (original, ...args) {
        const result = original.apply(this, args); scope.safe("register hair tab", () => ensure(this)); return result;
    });
    nativeTab = H.onTabSelected;
    handleTab = function (original, tab) {
        // Native selection may synchronously call onTabSelected("Appearance")
        // again while the requested custom tab is being initialized.
        if (routing.has(this)) return;
        failedTabs.delete(this);
        const requested = customTab(tab), previous = routes.get(this);
        if (requested && previous?.tab === requested && previous.phase === "active" &&
            nativeReady(this, previous.view)) return;
        routing.add(this);
        let route, result;
        try {
            if (!requested) {
                closeRoute(this);
                const result = original.call(this, tab);
                // A native handler can short-circuit because all three tabs
                // use switcher index 1. Restore native input actions explicitly.
                if (previous && String(tab).toLowerCase() === "appearance" && nativeReady(this, this.W_Appearance_V2)) {
                    const view = this.W_Appearance_V2;
                    scope.safe("restore outfit confirm action", () => view.refreshReplaceOutfitInputBar());
                    scope.safe("restore native hat action", () => view.refreshHatInputBar());
                }
                return result;
            }
            // Keep the native preview alive for switches inside Appearance.
            // Release the previous overlay before the next owner captures visibility.
            closeRoute(this);
            route = { host: this, tab: requested, view: null, page: null, token: null,
                phase: "pending", started: Date.now(), refreshLanguage };
            routes.set(this, route);
            attachRouteView(route);
            if (!nativeReady(this, this.W_Appearance_V2)) result = original.call(this, "Appearance");
            // Native code can replace the widget while initializing the shared page.
            attachRouteView(route);
            // Restore the logical tab once, under the reentrancy guard.
            if (R.valid(this.TabList) && customTab(this.TabList.GetSelectedTabId()) !== requested)
                this.TabList.SelectTabByID(requested, true);
            route.selectionMismatch = R.valid(this.TabList) && customTab(this.TabList.GetSelectedTabId()) !== requested;
            if (route.selectionMismatch) scope.log("[Combined UI] native tab selection differs from requested " + requested);
        } catch (error) {
            if (route) failRoute(route, error); else scope.report("select appearance tab", error);
        } finally { routing.delete(this); }
        if (route) openRoute(route);
        return result;
    };
    patch(H, "onTabSelected", "UI_Widget_Character_V3", C.paths.host, handleTab);
    patch(A, "BP_InitWidget", "UI_Widget_Appearance", C.paths.appearance, function (original, ...args) {
        const route = byView.get(this);
        // Native outfit creation and input setup must run in full. A page is
        // not allowed to intercept them merely because its tab was requested.
        if (route?.phase === "active") {
            if (route.page) { scope.safe("leave before native init", () => route.page.leave()); route.page.hairMode = false; }
            route.phase = "pending"; route.started = Date.now();
        }
        let result;
        initializing.add(this);
        try { result = original.apply(this, args); }
        finally { initializing.delete(this); }
        if (route && !routing.has(route.host)) scope.later(() => openRoute(route), 0);
        else if (!route) {
            // A genuinely reinitialized native page may reuse a previous tab.
            for (const host of knownHosts.keys()) if (R.valid(host) && host.W_Appearance_V2 === this) failedTabs.delete(host);
        }
        return result;
    });
    patch(A, "FinishCurrentWidget", "UI_Widget_Appearance", C.paths.appearance, function (original, ...args) {
        const route = byView.get(this);
        compat.beforeNativeMenuClose(this);
        if (route) {
            if (routing.has(route.host) || initializing.has(this)) {
                if (route.page) { scope.safe("leave before native finish", () => route.page.leave()); route.page.hairMode = false; }
                route.phase = "pending";
            } else { failedTabs.set(route.host, route.tab); closeRoute(route.host); }
        }
        scope.safe("release native preview", () => appearance.clearPreviewView(this));
        return original.apply(this, args);
    });
    patch(A, "Destruct", "UI_Widget_Appearance", C.paths.appearance, function (original, ...args) {
        const route = byView.get(this), page = U.pageByView.get(this);
        compat.beforeNativeMenuClose(this);
        if (route && (routing.has(route.host) || initializing.has(this))) { detachRouteView(route, true); route.phase = "pending"; }
        else if (route) closeRoute(route.host, true);
        else if (page) { scope.safe("destroy hair page", () => page.stop()); hosts.delete(page.host); }
        scope.safe("release destroyed preview", () => appearance.clearPreviewView(this));
        return original.apply(this, args);
    });
    for (const name of ["createSlots", "updateUnifiedText", "refreshAllSlots", "refreshHatInputBar", "refreshReplaceOutfitInputBar"]) patch(A, name, "UI_Widget_Appearance", C.paths.appearance, function (original, ...args) {
        const page = pageFor(this);
        // Never suppress native catalog construction. Framework slots must
        // continue to exist even when a custom overlay covers the outfit grid.
        if (name === "createSlots" || name === "refreshAllSlots") {
            const result = original.apply(this, args);
            if (page) scope.safe("refresh custom equipped markers", () => page.markEquipped());
            return result;
        }
        if (page) {
            if (name === "refreshReplaceOutfitInputBar") scope.safe("refresh Studio input", () => page.refreshAction());
            return;
        }
        const result = original.apply(this, args);
        if (name === "refreshReplaceOutfitInputBar") compat.afterNativeInputRefresh(this);
        return result;
    });
    patch(A, "Tick", "UI_Widget_Appearance", C.paths.appearance, function (original, ...args) {
        const result = original.apply(this, args);
        scope.safe("hair page frame", () => {
            const component = appearance.notePreviewView(this);
            if (R.valid(component)) {
                appearance.record(component);
                appearance.finishPreview(this, component);
            }
            const route = byView.get(this); if (route?.phase === "pending") openRoute(route);
            const page = pageFor(this); if (page) page.tick();
        });
        return result;
    });
    for (const name of ["applyIconDesaturate", "applyIconSize", "applyAppearanceNow"]) patch(B, name, "UI_Widget_Button_ButtonBaseWeaponAppearance", C.paths.card, function (original, ...args) {
        const info = U.cardInfo.get(this);
        if (!info) return original.apply(this, args);
        // Native mouse click and direction navigation share a selected plate.
        // Mere hover scales; the red equipped marker remains independent.
        const result = name === "applyAppearanceNow" ? original.call(this, U.cardSelected(info), ...args.slice(1)) : undefined;
        U.paintCard(this, info); return result;
    });
    // Preserve native selection transitions for clicks and keyboard/pad.
    // Pointer preview never changes the group's selected button.
    scope.patch(B, "DoSelectedApperanace", function (original, ...args) {
        const info = U.cardInfo.get(this);
        if (!info || info.page.active) return original.apply(this, args);
        this.applyAppearanceNow();
    }, "583ffada", C.paths.card);
    const hover = require("UI/Widget/Button/ButtonBaseWeapon"), helper = require("Library/UIHelper").default;
    patch(B, "BP_OnHovered", "UI_Widget_Button_ButtonBaseWeaponAppearance", C.paths.card, function (original, ...args) {
        const info = U.cardInfo.get(this);
        if (!info) return original.apply(this, args);
        if (!info.page.active || info.page.navigationMode) return;
        if (!helper.IsMouseAndKeyboardInputType(this)) return original.apply(this, args);
        const animation = hover.findWidgetAnimation(this, "AI_WeaponSlotHoverScale");
        if (!animation) return;
        this.hoverScaleAnimation = animation;
        if (!this.hoverScaleFinishedBound) {
            this.hoverScaleFinishedBound = true;
            this.BindToAnimationFinished(animation, P.toDelegate(this, () => { if (R.valid(this) && this.hoverScaleAnimation) this.onHoverScaleFinished(); }));
        }
        if (this.IsAnimationPlaying(animation) && !this.hoverScaleReversing) return;
        this.hoverScaleReversing = false; this.PlayAnimationForward(animation);
    });
    patch(B, "OnMouseEnter", "UI_Widget_Button_ButtonBaseWeaponAppearance", C.paths.card, function (original, ...args) {
        const info = U.cardInfo.get(this);
        if (!info) return original.apply(this, args);
        if (!info.page.active || !helper.IsMouseAndKeyboardInputType(this)) return;
        info.page.pointerEnter(info); this.BP_OnHovered();
        helper.playMouseHoverSound(this, "SFX_UI_Int_Interface_Common_Hover_Square");
    });
    scope.cleanup(() => {
        const customHosts = new Set(routes.keys());
        for (const host of customHosts) scope.safe("release wardrobe route", () => closeRoute(host));
        for (const [host, page] of hosts) {
            if (page) scope.safe("close hair page", () => {
                const showing = page.hairMode || customHosts.has(host);
                if (showing && R.valid(host)) host.W_Appearance_V2.FinishCurrentWidget(false);
                page.hairMode = false; page.stop();
                if (showing && R.valid(host)) host.TabList.SelectTabByID("Appearance");
            });
            if (R.valid(host) && R.valid(host.TabList)) scope.safe("remove hair tab", () => U.unregisterTab(host));
        }
        hosts.clear(); knownHosts.clear();
    });
    scope.safe("read appearance visual settings", () => settings.readVisualSettings(true));
    scope.safe("register Mods Menu appearance settings", () => settings.registerVisualMenu(() => {
        scope.safe("refresh gameplay fill intensity", () => appearance.playerFill.setIntensity(settings.fillIntensity));
        for (const component of appearance.records.keys()) scope.safe("refresh iris appearance", () => appearance.apply(component));
    }));
    scope.repeat(pollRoutes, 100);
    scope.repeat(() => appearance.tick(), 80);
    scope.log("loaded " + C.VERSION + "; native Hair and Masks tabs; " + C.gridStyles.length + " hairstyles, " + C.gridMasks.length + " masks; F restores defaults");
    exports.ready = true;
} catch (error) { scope.safe("startup rollback", () => scope.stop()); throw error; }
}
