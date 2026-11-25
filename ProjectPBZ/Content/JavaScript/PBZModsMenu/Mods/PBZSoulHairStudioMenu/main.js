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
function pageFor(view) { const p = U.pageByView.get(view); return p && p.hairMode ? p : null; }
try {
    const A = require("UI/Widget/Appearance").AppearanceMixinInterface.prototype;
    const H = require("UI/Widget/Character_V3").CharacterUI_V3MixinInterface.prototype;
    const B = require("UI/Widget/Button/ButtonBaseWeaponAppearance").ButtonBaseWeaponAppearanceInterface.prototype;
    const GM = require("Gameplay/GameModeBuild").GameModeBuildMixinInterface.prototype;
    for (const name of Native.requiredGameMode) validate(GM, name, "Gameplay_GameModeBuild");
    appearance = new (require("./appearance").Appearance)(scope, settings);
    const unregisterCompat = compat.registerStudio({
        previewHat(component) {
            const pending = appearance.preview.get(component);
            return !!pending && pending.hat !== settings.choice.hat;
        },
        previewPage() {
            for (const [host, page] of hosts) if (R.valid(host) && page?.active && page.hairMode && R.valid(page.view) && page.view.IsVisible() && !page.view.inputBarSuspended) return page.view;
            return null;
        },
        releaseHat(component) {
            if (!R.valid(component)) return;
            const record = appearance.records.get(component), native = appearance.nativeRow(component);
            if (record && native) Hats.release(component, record, native);
        },
        hasHat(component) { return !!appearance.records.get(component)?.hatOverride; }
    });
    scope.cleanup(unregisterCompat);
    function refreshLanguage() {
        for (const [host, page] of hosts) if (R.valid(host)) {
            U.refreshTab(host, settings);
            if (page) page.refreshLanguage();
            if (page && page.active) host.W_SecondTabLine.InitDataByText(U.flow(C.message(C.tabMessage(page.tab), settings.language)));
        }
    }
    function ensure(host) { U.registerTab(host, settings); if (!hosts.has(host)) hosts.set(host, null); }
    for (const name of ["BP_FirstInitWidget", "BP_InitWidget"]) patch(H, name, "UI_Widget_Character_V3", C.paths.host, function (original, ...args) {
        const result = original.apply(this, args); scope.safe("register hair tab", () => ensure(this)); return result;
    });
    patch(H, "onTabSelected", "UI_Widget_Character_V3", C.paths.host, function (original, tab) {
        let page = hosts.get(this);
        if (!C.isOurTab(tab)) {
            if (page && page.hairMode && String(tab).toLowerCase() !== "character") { this.W_Appearance_V2.FinishCurrentWidget(false); page.hairMode = false; }
            return original.call(this, tab);
        }
        if (page && page.active && page.tab === tab) return;
        try {
            if (this.WidgetSwitcher_31.GetActiveWidgetIndex() === 1) this.W_Appearance_V2.FinishCurrentWidget(false);
            if (!page) { page = new U.HairPage(scope, appearance, settings, this, refreshLanguage); hosts.set(this, page); }
            page.setTab(tab);
            page.hairMode = true;
            const result = original.call(this, "Appearance");
            if (page.active) this.W_SecondTabLine.InitDataByText(U.flow(C.message(C.tabMessage(tab), settings.language)));
            return result;
        } catch (error) {
            if (page) { scope.safe("rollback hair page", () => page.leave()); page.hairMode = false; }
            scope.report("open hair page", error);
            return original.call(this, "Appearance");
        }
    });
    patch(A, "BP_InitWidget", "UI_Widget_Appearance", C.paths.appearance, function (original, ...args) {
        const result = original.apply(this, args), page = pageFor(this);
        if (page) {
            // A JS exception crossing this UFUNCTION is logged and swallowed by
            // the native bridge, so the host's outer try/catch cannot roll back.
            try { page.open(); }
            catch (error) {
                scope.report("build hair page", error);
                scope.safe("leave partial hair page", () => page.leave());
                scope.safe("rollback partial hair content", () => page.clearContent());
                page.hairMode = false;
                scope.later(() => {
                    if (R.valid(this) && this.inputBarSuspended !== true && R.valid(page.host) && R.valid(page.host.TabList) && C.isOurTab(page.host.TabList.GetSelectedTabId())) page.host.TabList.SelectTabByID("Appearance", true);
                });
            }
        }
        return result;
    });
    patch(A, "FinishCurrentWidget", "UI_Widget_Appearance", C.paths.appearance, function (original, ...args) {
        const page = pageFor(this);
        if (page) { page.leave(); page.hairMode = false; }
        return original.apply(this, args);
    });
    patch(A, "Destruct", "UI_Widget_Appearance", C.paths.appearance, function (original, ...args) {
        const page = U.pageByView.get(this);
        if (page) { scope.safe("destroy hair page", () => page.stop()); hosts.delete(page.host); }
        return original.apply(this, args);
    });
    for (const name of ["createSlots", "updateUnifiedText", "refreshAllSlots", "refreshHatInputBar", "refreshReplaceOutfitInputBar"]) patch(A, name, "UI_Widget_Appearance", C.paths.appearance, function (original, ...args) {
        const page = pageFor(this);
        if (!page) return original.apply(this, args);
        if (name === "refreshAllSlots") page.markEquipped();
        if (name === "refreshReplaceOutfitInputBar") page.refreshAction();
    });
    patch(A, "Tick", "UI_Widget_Appearance", C.paths.appearance, function (original, ...args) {
        const result = original.apply(this, args);
        scope.safe("hair page frame", () => {
            const component = this.getPreviewDollComponent();
            if (R.valid(component)) {
                const outfit = this.getDisplayedPreviewOutfitID();
                if (outfit) appearance.outfitOverrides.set(component, String(outfit));
                appearance.record(component);
                appearance.finishPreview(this, component);
            }
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
        for (const [host, page] of hosts) {
            if (page) scope.safe("close hair page", () => {
                const showing = page.hairMode;
                if (showing && R.valid(host)) host.W_Appearance_V2.FinishCurrentWidget(false);
                page.hairMode = false; page.stop();
                if (showing && R.valid(host)) host.TabList.SelectTabByID("Appearance");
            });
            if (R.valid(host) && R.valid(host.TabList)) scope.safe("remove hair tab", () => U.unregisterTab(host));
        }
        hosts.clear();
    });
    scope.safe("read appearance visual settings", () => settings.readVisualSettings(true));
    scope.safe("register Mods Menu appearance settings", () => settings.registerVisualMenu(() => {
        scope.safe("refresh gameplay fill intensity", () => appearance.playerFill.setIntensity(settings.fillIntensity));
        for (const component of appearance.records.keys()) scope.safe("refresh iris appearance", () => appearance.apply(component));
    }));
    scope.repeat(() => appearance.tick(), 80);
    scope.log("loaded " + C.VERSION + "; native Hair and Masks tabs; " + C.gridStyles.length + " hairstyles, " + C.gridMasks.length + " masks; F restores defaults");
    exports.ready = true;
} catch (error) { scope.safe("startup rollback", () => scope.stop()); throw error; }
}
