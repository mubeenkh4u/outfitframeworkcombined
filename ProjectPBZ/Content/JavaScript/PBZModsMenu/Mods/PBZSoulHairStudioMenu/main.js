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
const traceLines = [], lastHostState = new WeakMap(), tabListeners = new Map();
let traceFile;
function trace(event, detail = "") {
    const line = new Date().toISOString() + " " + event + (detail ? " " + detail : "");
    traceLines.push(line); if (traceLines.length > 160) traceLines.shift();
    scope.log("[Combined UI 0.2.2] " + event + " " + detail);
    // Persist bounded diagnostics even when the Mods Menu console log is unavailable.
    try {
        if (!traceFile) {
            const k = UE.KismetSystemLibrary;
            traceFile = k.ConvertToAbsolutePath(k.GetProjectSavedDirectory()).replace(/[\\/]+$/, "") + "/PBZCombined-menu.log";
        }
        UE.EasyCsv.SaveStringToFileWithFullPath(traceLines.join("\n") + "\n", traceFile);
    } catch (_) { /* console remains available */ }
}
function selectedTab(host) {
    return R.valid(host) && R.valid(host.TabList) ? String(host.TabList.GetSelectedTabId()) : "";
}
function describe(host, view = host.W_Appearance_V2) {
    try { return "selected=" + selectedTab(host) + " switcher=" + (R.valid(host.WidgetSwitcher_31) ? host.WidgetSwitcher_31.GetActiveWidgetIndex() : "?") +
        " view=" + R.valid(view) + " suspended=" + (R.valid(view) ? view.inputBarSuspended : "?") + " visible=" + (R.valid(view) ? view.IsVisible() : "?"); }
    catch (error) { return "state unavailable: " + String(error); }
}
function observeTabs(host) {
    const list = host.TabList, previous = tabListeners.get(host);
    if (previous?.list === list || !R.valid(list)) return;
    if (previous) removeTabListener(host);
    const delegate = scope.safe("read CommonUI tab delegate", () => list.OnTabSelected);
    if (!delegate || typeof delegate.Add !== "function") { tabListeners.set(host, {list}); trace("delegate-unavailable", describe(host)); return; }
    const callback = id => {
        const tab = customTab(id);
        if (!tab || routing.has(host)) return;
        trace("delegate-tab", String(id));
        // Defer until the game finishes dispatching its native CommonUI callbacks.
        scope.later(() => {
            if (!R.valid(host) || selectedTab(host).toLowerCase() !== tab.toLowerCase() || routes.get(host)?.tab === tab || failedTabs.get(host) === tab) return;
            handleTab.call(host, nativeTab, tab);
        }, 0);
    };
    delegate.Add(callback); tabListeners.set(host, { list, delegate, callback }); trace("delegate-bound");
}
function removeTabListener(host) {
    const record = tabListeners.get(host); tabListeners.delete(host);
    if (record?.delegate && R.valid(record.list)) scope.safe("remove tab observer", () => record.delegate.Remove(record.callback));
}
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
    return (route?.phase === "active" || route?.phase === "opening") && page?.active && page.hairMode && compat.studioOwnsMenu(view) ? page : null;
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
    trace("route-error", route.tab + " " + describe(route.host) + " " + String(error?.stack || error).slice(0, 1800));
    failedTabs.set(route.host, route.tab);
    closeRoute(route.host, true);
    // Do not leave a broken custom panel or a hidden native outfit list.
    scope.later(() => {
        const host = route.host;
        if (routes.has(host) || !R.valid(host) || !R.valid(host.TabList)) return;
        if (customTab(host.TabList.GetSelectedTabId())) host.TabList.SelectTabByID("Appearance", true);
    }, 0);
}
function openRoute(route, fromNativeInit = false) {
    if (routes.get(route.host) !== route || route.phase !== "pending" || initializing.has(route.view)) return;
    if (!fromNativeInit && routing.has(route.host)) return;
    if (!attachRouteView(route) || (!fromNativeInit && !nativeReady(route.host, route.view))) return;
    trace("overlay-open", route.tab + " nativeInit=" + fromNativeInit + " " + describe(route.host, route.view));
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
        scope.safe("update custom tab title", () => route.host.W_SecondTabLine.InitDataByText(U.flow(C.message(C.tabMessage(route.tab), settings.language))));
        trace("overlay-active", route.tab + " cards=" + (page.cards?.length ?? "?") + " " + describe(route.host));
    } catch (error) { failRoute(route, error); }
}
function pollRoutes() {
    const now = Date.now();
    // A host may have bound its original native callbacks before this loader
    // started. Discover existing widgets only when no live host is known.
    if (now >= nextHostScan) {
        nextHostScan = now + 1500;
        for (const host of knownHosts.keys()) if (!R.valid(host)) {
            knownHosts.delete(host); removeTabListener(host); closeRoute(host, true); hosts.delete(host);
        }
        if (![...knownHosts.keys()].some(host => R.valid(host) && host.IsVisible()) && UE.WidgetBlueprintLibrary?.GetAllWidgetsOfClass) scope.safe("discover existing character menu", () => {
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
        if (!R.valid(host)) { knownHosts.delete(host); removeTabListener(host); closeRoute(host, true); hosts.delete(host); continue; }
        if (!R.valid(host.TabList) || typeof host.IsVisible === "function" && !host.IsVisible() || routing.has(host)) continue;
        if (now - last >= 1000) {
            knownHosts.set(host, now);
            scope.safe("repair dynamic tab registration", () => {
                try {
                    if (!U.tabsReady(host)) { U.registerTab(host, settings); trace("tabs-repaired", String(U.tabsReady(host))); }
                } catch (error) { scope.report("repair dynamic tabs", error); }
                observeTabs(host);
            });
        }
        // Detect a real selected-tab change even when CommonUI invokes a cached
        // native delegate rather than the patched onTabSelected method.
        scope.safe("reconcile selected appearance tab", () => {
            const selected = selectedTab(host), requested = customTab(selected), route = routes.get(host);
            const state = selected + "|" + (route?.phase || "native") + "|" + String(scope.safe("read tab caches", () => U.tabsReady(host)));
            if (lastHostState.get(host) !== state) { lastHostState.set(host, state); trace("host-state", state + " " + describe(host)); }
            if (requested && route?.tab !== requested && failedTabs.get(host) !== requested && handleTab && nativeTab) {
                trace("recovered-tab", requested);
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
            // Visibility may be transient during an actual native init. Only
            // close a confirmed inactive host after a grace period.
            route.hiddenSince ??= now;
            if (now - route.hiddenSince > 1000) closeRoute(host);
            continue;
        }
        route.hiddenSince = undefined;
        if (route.phase === "active" && host.W_Appearance_V2 !== route.view) {
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
        try {
            U.registerTab(host, settings);
            trace("tabs-registered", String(U.tabsReady(host)) + " " + describe(host));
        } catch (error) {
            trace("tabs-register-error", String(error?.stack || error).slice(0,1800));
            scope.report("register dynamic tabs", error);
        }
        scope.safe("observe selected tab", () => observeTabs(host));
    }
    for (const name of ["BP_FirstInitWidget", "BP_InitWidget"]) patch(H, name, "UI_Widget_Character_V3", C.paths.host, function (original, ...args) {
        const result = original.apply(this, args); scope.safe("register hair tab", () => ensure(this)); return result;
    });
    nativeTab = H.onTabSelected;
    handleTab = function (original, tab) {
        // Native selection may synchronously call onTabSelected("Appearance")
        // again while the requested custom tab is being initialized.
        if (routing.has(this)) { trace("recursive-tab-skipped", String(tab)); return; }
        trace("native-tab", String(tab) + " " + describe(this));
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
            // Restore the upstream Studio entry sequence: finish the old view,
            // then call native Appearance initialization on every custom tab switch.
            // The lease survives the native Finish/Init pair.
            closeRoute(this);
            route = { host: this, tab: requested, view: null, page: null, token: null,
                phase: "pending", started: Date.now(), refreshLanguage };
            routes.set(this, route);
            attachRouteView(route);
            const view = this.W_Appearance_V2;
            if (R.valid(view) && R.valid(this.WidgetSwitcher_31) && this.WidgetSwitcher_31.GetActiveWidgetIndex() === 1) {
                trace("native-finish-request", requested); view.FinishCurrentWidget(false);
            }
            trace("native-init-request", requested);
            result = original.call(this, "Appearance");
            if (routes.get(this) !== route) return result; // build failure already rolled back
            // Native code can replace the widget while initializing the shared page.
            attachRouteView(route);
            // Restore the logical tab once, under the reentrancy guard.
            if (R.valid(this.TabList) && customTab(this.TabList.GetSelectedTabId()) !== requested)
                this.TabList.SelectTabByID(requested, true);
            route.selectionMismatch = R.valid(this.TabList) && customTab(this.TabList.GetSelectedTabId()) !== requested;
            if (route.selectionMismatch) trace("tab-selection-mismatch", requested + " " + describe(this));
        } catch (error) {
            if (route) failRoute(route, error); else scope.report("select appearance tab", error);
        } finally { routing.delete(this); }
        if (route) { openRoute(route); trace("native-return", route.tab + " phase=" + route.phase + " " + describe(this)); }
        return result;
    };
    patch(H, "onTabSelected", "UI_Widget_Character_V3", C.paths.host, handleTab);
    patch(A, "BP_InitWidget", "UI_Widget_Appearance", C.paths.appearance, function (original, ...args) {
        const route = byView.get(this);
        if (route) trace("native-bp-init", route.tab);
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
        if (route) {
            // This is the upstream opening point, even if CommonUI has not
            // yet switched visibility. Do not depend on IsVisible in this hook.
            openRoute(route, true);
            if (route.phase === "pending") scope.later(() => openRoute(route), 0);
        }
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
            trace("native-finish", route.tab + " transitioning=" + (routing.has(route.host) || initializing.has(this)));
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
        // Restore upstream active-overlay behavior. Native init is always
        // allowed before the overlay; afterwards native grid refreshes must
        // not replace our overlay, selection, focus, or input bindings.
        if (page) {
            if (name === "refreshAllSlots") scope.safe("refresh custom equipped markers", () => page.markEquipped());
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
        for (const host of [...tabListeners.keys()]) removeTabListener(host);
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
    trace("startup", "menu repair 0.2.2; native finish/init restored");
    scope.repeat(pollRoutes, 250);
    scope.repeat(() => appearance.tick(), 80);
    scope.log("loaded " + C.VERSION + "; native Hair and Masks tabs; " + C.gridStyles.length + " hairstyles, " + C.gridMasks.length + " masks; F restores defaults");
    exports.ready = true;
} catch (error) { scope.safe("startup rollback", () => scope.stop()); throw error; }
}
