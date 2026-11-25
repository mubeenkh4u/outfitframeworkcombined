"use strict";
const UE = require("ue"), P = require("puerts"), C = require("./catalog"), R = require("./runtime");
const NativeUI = require("Library/UIHelper").default;
const NativeGrid = require("UI/Widget/Button/GridSelectionTransition");
const gridWidth = 448;
const cardSize = 95;
const swatchSize = 42;
const swatchRowHeight = 54;
const pageByView = new WeakMap(), cardInfo = new WeakMap(), tabSpacing = new WeakMap();
exports.pageByView = pageByView; exports.cardInfo = cardInfo;
exports.cardSelected = info => info.button.GetSelected();
function flow(text) { const v = new UE.FlowLocText(); v.Namespace = ""; v.Key = ""; v.ValueCache = R.text(text); return v; }
function tint(values) { const c = new UE.SlateColor(); c.SpecifiedColor = R.rgba(values); c.ColorUseRule = UE.ESlateColorStylingMode.UseColor_Specified; return c; }
function font(size, language) {
    const f = new UE.SlateFontInfo(), path = language === "en" ? C.paths.fontEN : C.paths.font;
    f.FontObject = UE.Font.Load(path);
    if (!R.valid(f.FontObject) || R.path(f.FontObject) !== path) throw new Error("Native character font unavailable");
    f.TypefaceFontName = "Default"; f.LetterSpacing = language === "en" ? 0 : 15; f.Size = size; return f;
}
function makeText(view, text, size, language) {
    const w = R.make(UE.PBZCommonLocText, view);
    w.SetStyle(R.loadClass(language === "en" ? C.paths.textStyleEN : C.paths.textStyle));
    w.SetFont(font(size, language)); w.SetText(R.text(text)); w.SetColorAndOpacity(tint([1, 1, 1]));
    w.SetVisibility(UE.ESlateVisibility.HitTestInvisible); return w;
}
function makeSwatchFrame(view) {
    const project = UE.KismetSystemLibrary.ConvertToAbsolutePath(UE.KismetSystemLibrary.GetProjectDirectory()).replace(/[\\/]?$/, "/");
    const folders = ["PBZModLoader/mods/PBZSoulHairStudio/", "Content/JavaScript/PBZModsMenu/Mods/PBZSoulHairStudioMenu/"];
    const asset = folders.map(folder => project + folder + "assets/swatch-ink.png").find(file => UE.BlueprintPathsLibrary.FileExists(file));
    if (!asset) throw new Error("Swatch ink texture missing");
    const texture = UE.KismetRenderingLibrary.ImportFileAsTexture2D(view, asset);
    if (!R.valid(texture) || !texture.IsA(UE.Texture2D.StaticClass())) throw new Error("Swatch ink texture unavailable");
    texture.Filter = UE.TextureFilter.TF_Bilinear;
    const brush = new UE.SlateBrush();
    brush.DrawAs = UE.ESlateBrushDrawType.Image;
    brush.ImageType = UE.ESlateBrushImageType.FullColor;
    brush.ResourceObject = texture;
    brush.TintColor = tint([1, 1, 1]);
    R.brushSize(brush, swatchSize, swatchSize);
    const image = R.make(UE.Image, view);
    image.SetBrush(brush);
    image.SetDesiredSizeOverride(R.vec2(swatchSize, swatchSize));
    image.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
    image.SetRenderScale(R.vec2(1.16, 1.16));
    return image;
}
function swatchBrush(brush, info) {
    const page = info.page;
    brush.TintColor = tint(C.linear(info.item.hex));
    if (!page.swatchFallback) {
        try {
            // Reuse the brush's native struct wrappers. The game's PuerTS
            // FVector4 constructor rejects the zero-argument call.
            const outline = brush.OutlineSettings, corners = outline.CornerRadii;
            corners.X = corners.Y = corners.Z = corners.W = 7;
            outline.CornerRadii = corners;
            outline.RoundingType = UE.ESlateBrushRoundingType.FixedRadius;
            outline.Width = 2.5; outline.Color = tint([.40, .39, .35]);
            brush.OutlineSettings = outline;
            brush.DrawAs = UE.ESlateBrushDrawType.RoundedBox;
            return;
        } catch (error) {
            page.swatchFallback = true;
            page.scope.log("use the stock swatch image after outline failure: " + error);
        }
    }
    // Swatch decoration must not prevent the hairstyle cards from opening.
    if (!R.valid(page.swatchFallbackTexture)) {
        page.swatchFallbackTexture = UE.Texture2D.Load(C.paths.colorStroke);
        if (!R.valid(page.swatchFallbackTexture) || R.path(page.swatchFallbackTexture) !== C.paths.colorStroke) throw new Error("Color brushstroke icon unavailable");
    }
    brush.ResourceObject = page.swatchFallbackTexture;
    brush.ImageType = UE.ESlateBrushImageType.FullColor;
    brush.DrawAs = UE.ESlateBrushDrawType.Image;
}
function image(button, info) {
    if (!R.valid(button.IconImage)) throw new Error("Native appearance card has no IconImage");
    if (!info.brush) {
        const b = new UE.SlateBrush();
        b.ResourceObject = info.texture || null; b.ResourceName = "None";
        b.ImageType = info.texture ? UE.ESlateBrushImageType.FullColor : UE.ESlateBrushImageType.NoImage;
        if (C.isSwatch(info.kind)) swatchBrush(b, info);
        else {
            b.DrawAs = UE.ESlateBrushDrawType.Image;
            b.TintColor = tint([1, 1, 1]);
        }
        R.brushSize(b, 93, 93);
        info.brush = b;
    }
    button.IconImage.SetBrush(info.brush); button.IconImage.SetDesiredSizeOverride(R.vec2(93, 93));
}
const compat = require("./combined-compat");
function committedAtelierHat() {
    const player = UE.PBZAppearanceComponent.GetPBZAppearanceComponent(R.gi());
    return R.valid(player) ? compat.atelierHatRow(player.GetEffectiveOutfit(), player) : undefined;
}
function isEquipped(info) {
    const choice = info.page.settings.choice[info.kind];
    if (info.kind !== "hat") return info.item.id === choice;
    const player = UE.PBZAppearanceComponent.GetPBZAppearanceComponent(R.gi());
    if (!R.valid(player)) return choice !== "outfit" && info.item.id === choice;
    const outfit = player.GetEffectiveOutfit();
    const atelierHat = compat.atelierHatRow(outfit, player);
    if (atelierHat !== undefined) return !player.IsHatHiddenForOutfit(outfit) && atelierHat === info.item.id;
    if (choice !== "outfit") return info.item.id === choice;
    if (!outfit || String(outfit).toLowerCase() === "none" || player.IsHatHiddenForOutfit(outfit)) return false;
    return String(UE.PBZAppearanceComponent.GetAppearanceStruct(outfit).OutfitHatItem) === info.item.id;
}
exports.paintCard = function (button, info) {
    image(button, info);
    const equipped = isEquipped(info);
    info.equipped = equipped;
    // The shipped IsEquipItem interface reads this BP flag. Keep it in sync
    // with the marker, including initial construction after a fresh game start.
    button["Is Equip"] = equipped;
    if (R.valid(button.EquipImage)) {
        button.EquipImage.SetRenderOpacity(1);
        button.EquipImage.SetVisibility(equipped ? UE.ESlateVisibility.SelfHitTestInvisible : UE.ESlateVisibility.Collapsed);
    }
};
class HairPage {
    constructor(scope, appearance, settings, host, onLanguageChanged) {
        this.scope = scope; this.appearance = appearance; this.settings = settings; this.host = host; this.view = host.W_Appearance_V2;
        this.active = false; this.built = false; this.navigationMode = true; this.tab = C.TAB; this.cards = []; this.rows = []; this.hidden = []; this.pending = { ...settings.choice }; this.serial = 0;
        pageByView.set(this.view, this);
        this.confirmDelegate = P.toDelegate(this.view, () => { if (this.active) this.confirmSelected(); });
        this.followDelegate = P.toDelegate(this.view, () => { if (this.active) this.followOutfit(); });
        this.followClick = () => { if (this.active) this.followOutfit(); };
        this.onLanguageChanged = onLanguageChanged;
        this.languageClick = () => { if (this.active) this.scope.safe("switch language", () => this.toggleLanguage()); };
    }
    build() {
        if (this.built && R.valid(this.root)) return;
        this.clearContent();
        try { this.buildContent(); this.built = true; }
        catch (error) { this.clearContent(); throw error; }
    }
    setTab(tab) {
        if (!C.isOurTab(tab)) throw new Error("Unknown appearance category");
        if (this.tab === tab) return;
        this.leave(); this.clearContent(); this.tab = tab; this.selectedInfo = null;
    }
    buildContent() {
        if (R.fingerprint(NativeUI.setNavRuleSafe) !== "e4d5db61") throw new Error("Native appearance navigation helper changed");
        if (R.fingerprint(NativeGrid.clearGridSelectionTransition) !== "ffeabac1") throw new Error("Native grid selection cleanup helper changed");
        const view = this.view, parent = view.W_SystemPanel.GetParent();
        if (!R.valid(parent) || !parent.IsA(UE.Overlay.StaticClass())) throw new Error("Native appearance layout changed");
        this.root = R.make(UE.SizeBox, view); this.root.SetWidthOverride(472); this.root.SetHeightOverride(510);
        const slot = parent.AddChildToOverlay(this.root);
        this.parentOverlay = parent; this.overlaySlot = slot; this.positioned = false;
        slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left); slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);
        slot.SetPadding(R.margin(95, 270, 0, 0));
        this.scroll = R.make(UE.PBZScrollBoxBase, view); this.root.AddChild(this.scroll);
        this.scroll.SetOrientation(UE.EOrientation.Orient_Vertical);
        this.scroll.SetConsumeMouseWheel(UE.EConsumeMouseWheel.WhenScrollingPossible);
        this.scroll.SetAnimateWheelScrolling(true); this.scroll.SetWheelScrollMultiplier(1);
        // Reuse the native scrollbar style, thickness and padding. The fixed
        // 448-wide card grid leaves a separate 24-wide scrollbar area.
        this.scroll.SetClipping(UE.EWidgetClipping.ClipToBounds);
        const vertical = R.make(UE.VerticalBox, view); this.scroll.AddChild(vertical);
        this.group = R.make(UE.PBZButtonGroup, view); this.group.bBindButtonNavigation = false; this.group.SetSelectionRequired(false);
        let navigationRow = 0, sectionIndex = 0; this.headings = [];
        for (const [kind, headingKey, items] of C.sectionsFor(this.tab)) {
            const heading = makeText(view, C.message(headingKey, this.settings.language), 18, this.settings.language), hs = vertical.AddChildToVerticalBox(heading); hs.SetPadding(R.margin(7, sectionIndex++ === 0 ? 0 : 24, 0, 12));
            this.headings.push([headingKey, heading]);
            const swatches = C.isSwatch(kind), columns = swatches ? C.swatchColumns : 4;
            const size = swatches ? swatchSize : cardSize, pitch = gridWidth / columns;
            const grid = R.make(UE.UniformGridPanel, view); grid.SetMinDesiredSlotWidth(pitch); grid.SetMinDesiredSlotHeight(swatches ? swatchRowHeight : 112);
            grid.SetSlotPadding(swatches ? R.margin((pitch - size) / 2, (swatchRowHeight - size) / 2, (pitch - size) / 2, (swatchRowHeight - size) / 2) : R.margin(7));
            const frame = R.make(UE.SizeBox, view); frame.SetWidthOverride(gridWidth); frame.AddChild(grid);
            vertical.AddChildToVerticalBox(frame).SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);
            // Keep four columns even in the three-face section. Otherwise a
            // UniformGrid spreads three cards across the width at a wider pitch.
            if (items.length < columns) {
                const filler = R.make(UE.SizeBox, view); filler.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
                grid.AddChildToUniformGrid(filler, 0, columns - 1);
            }
            items.forEach((item, index) => {
                const box = R.make(UE.SizeBox, view); box.SetWidthOverride(size); box.SetHeightOverride(size);
                const button = R.newWidget(C.paths.card, view);
                let swatchOverlay;
                if (swatches) {
                    // Scale the whole stock card, including its hit target,
                    // equipped marker, focus plate and hover animation.
                    const scale = R.make(UE.ScaleBox, view);
                    scale.SetStretch(UE.EStretch.ScaleToFit);
                    scale.SetStretchDirection(UE.EStretchDirection.DownOnly);
                    const plate = R.make(UE.SizeBox, view);
                    plate.SetWidthOverride(cardSize); plate.SetHeightOverride(cardSize);
                    swatchOverlay = R.make(UE.Overlay, view);
                    swatchOverlay.SetVisibility(UE.ESlateVisibility.SelfHitTestInvisible);
                    plate.AddChild(button); scale.AddChild(plate); swatchOverlay.AddChildToOverlay(scale); box.AddChild(swatchOverlay);
                } else box.AddChild(button);
                const row = Math.floor(index / columns), col = index % columns;
                const info = { page: this, kind, item, button, swatchOverlay, texture: null, index: this.cards.length, navRow: navigationRow + row, col, navX: (col + .5) / columns };
                cardInfo.set(button, info); this.cards.push(info);
                (this.rows[info.navRow] ||= []).push(info);
                button.SetIsFocusable(true); button.SetIsSelectable(true);
                // CommonUI can disable a selected non-toggleable button.
                // It must keep receiving the second mouse click to confirm.
                button.SetIsToggleable(false); button.SetIsInteractableWhenSelected(true);
                // Keep native gamepad/click selection; keyboard navigation is
                // explicitly selected by navigationTarget, never mouse hover.
                button.AutoSelectMode = UE.EPBZButtonAutoSelectMode.GamepadFocusOrMouseClick;
                button.bSetSelectedOnHover = false; button.bSetFocusOnSelected = true;
                // Runtime-created UserWidgets need not have the native panel
                // in their Outer chain. Opt only our cards into its stock
                // retainer/line transition using the native cached host flag.
                button.gridSelectionTransitionInPanel = true;
                for (const name of ["LockImg", "RedPoint"]) if (R.valid(button[name])) button[name].SetVisibility(UE.ESlateVisibility.Collapsed);
                if (kind === "style" || kind === "face" || kind === "mask" || kind === "hat") {
                    const path = C.iconPath(kind, item.id); info.texture = UE.Texture2D.Load(path);
                    if (!R.valid(info.texture) || R.path(info.texture).toLowerCase() !== path.toLowerCase()) throw new Error("Cosmetic icon unavailable: " + path);
                }
                image(button, info); this.group.AddWidget(button);
                const cell = grid.AddChildToUniformGrid(box, row, col);
                // Center the fixed square: Fill stretches SizeBox children to
                // the cell height and turns native selection plates rectangular.
                cell.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Center); cell.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Center);
                button.applyAppearanceNow(false);
            });
            navigationRow += Math.ceil(items.length / columns);
        }
        this.onSelected = (button) => { if (this.active && R.valid(button)) {
            const info = cardInfo.get(button);
            if (info) {
                if (!NativeUI.IsMouseAndKeyboardInputType(button) && !this.navigationMode) {
                    this.setFeedbackMode(true, button); button.DoSelectedApperanace(button.GetSelected());
                }
                button.SetFocus(); if (!this.initializingFocus) this.select(info);
            }
        } };
        this.onClicked = (button) => { if (this.active && R.valid(button)) { const info = cardInfo.get(button); if (info) {
            this.selectButton(info);
            // Mouse clicks select; the native double-click event confirms.
            // Gamepad activation still shares the native confirm action.
            if (!NativeUI.IsMouseAndKeyboardInputType(button)) this.confirmSelected();
        } } };
        this.onDoubleClicked = (button) => { if (this.active && R.valid(button)) {
            const info = cardInfo.get(button); if (!info) return;
            button.StopDoubleClickPropagation();
            this.selectButton(info); this.confirmSelected();
        } };
        this.group.OnSelectedButtonBaseChanged.Add(this.onSelected); this.group.OnButtonBaseClicked.Add(this.onClicked);
        this.group.OnButtonBaseDoubleClicked.Add(this.onDoubleClicked);
        for (const info of this.cards) {
            info.onUnhovered = () => this.pointerLeave(info);
            info.button.OnButtonBaseUnhovered.Add(info.onUnhovered);
        }
        this.languageRoot = R.make(UE.SizeBox, view); this.languageRoot.SetWidthOverride(280); this.languageRoot.SetHeightOverride(44);
        const languageSlot = parent.AddChildToOverlay(this.languageRoot);
        languageSlot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left); languageSlot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Bottom);
        languageSlot.SetPadding(R.margin(95, 0, 0, 18));
        // The shipped word-tip button supplies hover, press, focus and sounds.
        // No input binding or key glyph is created for the language switch.
        const button = this.languageButton = R.newWidget(C.paths.languageButton, view); this.languageRoot.AddChild(button);
        if (!R.valid(button.RichText) || !R.valid(button.InputActionWidget)) throw new Error("Native language button layout changed");
        button.SetIsFocusable(true); button.InputActionWidget.SetVisibility(UE.ESlateVisibility.Collapsed);
        if (R.valid(button.Image_51)) button.Image_51.SetVisibility(UE.ESlateVisibility.Collapsed);
        button.OnButtonBaseClicked.Add(this.languageClick);
        // Use the same owner-bound Custom navigation as the native SystemPanel.
        // Resolve live cards at input time; never capture a target Slate widget
        // or hold an obsolete card in a permanent delegate closure.
        this.cards.forEach((info, index) => this.bindNavigation(info.button, index));
        this.bindNavigation(button, -1);
        this.refreshLanguage();
    }
    bindNavigation(button, index) {
        const generation = this.navigationGeneration;
        const resolve = direction => generation === this.navigationGeneration ? this.navigationTarget(index, direction) : undefined;
        for (const direction of [UE.EUINavigation.Left, UE.EUINavigation.Right, UE.EUINavigation.Up, UE.EUINavigation.Down]) NativeUI.setNavRuleSafe(button, direction, resolve);
    }
    clearCardFeedback(button) {
        if (button.appearanceTimer) { clearTimeout(button.appearanceTimer); button.appearanceTimer = 0; }
        if (button.selectedRetryTimer) { clearTimeout(button.selectedRetryTimer); button.selectedRetryTimer = 0; }
        NativeGrid.clearGridSelectionTransition(button);
    }
    setFeedbackMode(navigation, deferButton) {
        if (this.navigationMode === navigation) return;
        this.navigationMode = navigation;
        const hover = require("UI/Widget/Button/ButtonBaseWeapon");
        for (const info of this.cards) if (R.valid(info.button)) {
            this.clearCardFeedback(info.button);
            hover.resetGridSlotHoverAnimation(info.button, info.button.hoverScaleAnimation);
            if (info.button !== deferButton) info.button.applyAppearanceNow();
        }
    }
    pointerEnter(info) {
        if (!this.active) return;
        this.setFeedbackMode(false);
        this.hoverInfo = info; this.previewCard(info, false);
    }
    pointerLeave(info) {
        if (!this.active || this.navigationMode || this.hoverInfo !== info) return;
        this.hoverInfo = null;
        const selected = this.currentCard();
        if (selected) this.previewCard(selected, false);
        else { ++this.serial; this.pendingKind = null; this.pending = { ...this.settings.choice }; this.preview(); }
    }
    selectButton(info) {
        const index = info.index;
        if (this.cards[index] !== info || !R.valid(this.group)) return;
        if (this.group.GetSelectedButtonBase() !== info.button) this.group.SelectButtonAtIndex(index, false);
        else this.select(info);
        info.button.SetFocus();
    }
    openInfo() {
        if (this.infoState) this.closeInfo();
        const panel = this.view.W_UnifiedTextDescription;
        if (!R.valid(panel) || !R.valid(panel.ItemNameText) || !R.valid(panel.ItemTypeText)) throw new Error("Native appearance information panel changed");
        const title = panel.ItemNameText, status = panel.ItemTypeText;
        const detail = panel.ItemSubHeadText;
        this.infoState = { panel, visibility: panel.GetVisibility(), titleText: title.GetText(), statusText: status.GetText(), titleOpacity: title.GetRenderOpacity(), statusOpacity: status.GetRenderOpacity(), hidden: [] };
        if (R.valid(detail)) this.infoState.detail = { widget: detail, text: detail.GetText(), opacity: detail.GetRenderOpacity() };
        for (const name of ["DetailTextSwitcher", "ItemLevelText", "ItemSubHeadText", "FlowerLineOverlay", "ProgressEntrySizeBox", "ZhuHunImage", "BottomBox"]) {
            const widget = panel[name]; if (R.valid(widget)) { this.infoState.hidden.push([widget, widget.GetVisibility()]); widget.SetVisibility(UE.ESlateVisibility.Collapsed); }
        }
        panel.SetVisibility(UE.ESlateVisibility.SelfHitTestInvisible);
        title.SetRenderOpacity(1); status.SetRenderOpacity(1);
        this.infoTitle = title; this.status = status;
    }
    closeInfo() {
        const state = this.infoState; this.infoState = null;
        if (!state) return;
        if (R.valid(this.infoTitle)) { this.infoTitle.SetPBZFormatText(state.titleText); this.infoTitle.SetRenderOpacity(state.titleOpacity); }
        if (R.valid(this.status)) { this.status.SetPBZFormatText(state.statusText); this.status.SetRenderOpacity(state.statusOpacity); }
        if (R.valid(state.detail?.widget)) { state.detail.widget.SetPBZFormatText(state.detail.text); state.detail.widget.SetRenderOpacity(state.detail.opacity); }
        for (const [widget, visibility] of state.hidden) if (R.valid(widget)) widget.SetVisibility(visibility);
        if (R.valid(state.panel)) state.panel.SetVisibility(state.visibility);
        this.infoTitle = null; this.status = null;
    }
    updateSwatchFocus(info) {
        const target = info?.swatchOverlay;
        if (!this.swatchFrame && R.valid(target)) this.swatchFrame = makeSwatchFrame(this.view);
        if (!R.valid(this.swatchFrame) || this.swatchFrame.GetParent() === target) return;
        this.swatchFrame.RemoveFromParent();
        if (R.valid(target)) {
            const slot = target.AddChildToOverlay(this.swatchFrame);
            slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
            slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
        }
    }
    navigationTarget(index, direction) {
        if (!this.active || this.view.inputBarSuspended || !R.valid(this.view)) return undefined;
        const layout = UE.PBZBlueprintFunctionLibrary.GetUILayOut(this.view);
        if (!R.valid(layout) || layout.HasModal()) return undefined;
        let target;
        const info = this.cards[index];
        if (index < 0) {
            target = direction === UE.EUINavigation.Up ? this.cards[this.cards.length - 1]?.button : undefined;
        } else if (!info || !R.valid(info.button)) {
            return undefined;
        } else if (direction === UE.EUINavigation.Left || direction === UE.EUINavigation.Right) {
            const row = this.rows[info.navRow], delta = direction === UE.EUINavigation.Left ? -1 : 1;
            target = row[Math.max(0, Math.min(row.length - 1, info.col + delta))]?.button;
        } else if (direction === UE.EUINavigation.Up || direction === UE.EUINavigation.Down) {
            const row = this.rows[info.navRow + (direction === UE.EUINavigation.Up ? -1 : 1)];
            const nearest = row?.reduce((best, item) => Math.abs(item.navX - info.navX) < Math.abs(best.navX - info.navX) ? item : best);
            target = nearest?.button ?? (direction === UE.EUINavigation.Down ? this.languageButton : undefined);
        }
        // In this manual group, native navigation moves Slate focus without
        // selecting the card. Use the native group operation so its existing
        // selection callback updates focus feedback, preview and confirm action.
        const targetIndex = cardInfo.get(target)?.index ?? -1;
        if (R.valid(target)) this.setFeedbackMode(true);
        if (targetIndex >= 0 && R.valid(target) && R.valid(this.group)) {
            if (this.group.GetSelectedButtonBase() !== target) this.group.SelectButtonAtIndex(targetIndex, false);
            else this.select(this.cards[targetIndex]);
        }
        if (this.navigationTraceBudget > 0) {
            --this.navigationTraceBudget;
            const selected = R.valid(this.group) ? this.group.GetSelectedButtonBase() : undefined;
            this.scope.log("content navigation " + this.tab + " source=" + index + " direction=" + direction + " target=" + (target === this.languageButton ? "language" : targetIndex) + " selected=" + this.cards.findIndex(x => x.button === selected));
        }
        return R.valid(target) ? target : undefined;
    }
    unbindNavigation(button) {
        for (const direction of [UE.EUINavigation.Left, UE.EUINavigation.Right, UE.EUINavigation.Up, UE.EUINavigation.Down]) button.SetNavigationRuleBase(direction, UE.EUINavigationRule.Stop);
    }
    open() {
        this.active = false; this.pendingKind = null; this.previewedComponent = null; this.pending = { ...this.settings.choice }; this.build(); this.active = true;
        this.navigationTraceBudget = 4;
        this.positioned = false;
        this.root.SetVisibility(UE.ESlateVisibility.SelfHitTestInvisible);
        this.languageRoot.SetVisibility(UE.ESlateVisibility.SelfHitTestInvisible); this.notice = null; this.refreshLanguage();
        this.openInfo();
        for (const name of ["W_SystemPanel", "ScaleBox_0", "PBZCommonLocRichText_0", "Image_153"]) {
            const w = this.view[name]; if (R.valid(w)) { this.hidden.push([w, w.GetVisibility()]); w.SetVisibility(UE.ESlateVisibility.Collapsed); }
        }
        this.view.RemoveKeyDelegate.Broadcast("ShowHat"); this.view.RemoveKeyDelegate.Broadcast("HideHat");
        this.setFeedbackMode(true); this.markEquipped(); this.refreshAction(); this.preview();
        this.group.DeselectAll(); this.selectedInfo = null;
        const selected = this.cards.findIndex(x => x.kind === (this.tab === C.MASK_TAB ? "mask" : "style") && x.item.id === this.pending[x.kind]);
        if (selected >= 0) this.selectedInfo = this.cards[selected];
        // Match the native panel's explicit selection-to-focus handoff. A
        // default outfit/no-mask has no card: focus the first without previewing
        // or equipping it until the player navigates or clicks it.
        this.initializingFocus = true;
        try {
            this.group.SelectButtonAtIndex(Math.max(0, selected), false);
            this.group.GetSelectedButtonBase().SetFocus();
        } finally { this.initializingFocus = false; }
        this.refreshAction();
        this.openFollowAction();
        this.scope.log("content navigation ready " + this.tab + "; native-custom; " + this.cards.length + " cards");
    }
    select(info) {
        this.notice = null;
        this.selectedInfo = info; this.hoverInfo = null;
        this.previewCard(info, true);
    }
    previewCard(info, scroll) {
        // Each hover/focus previews one field against the applied appearance.
        // Passing through another section must not queue that section's choice.
        this.pendingKind = info.kind;
        this.pending = this.settings.withChoiceField(info.kind, info.item.id);
        this.refreshAction();
        if (scroll) this.scroll.ScrollWidgetIntoView(info.button, true, UE.EDescendantScrollDestination.IntoView, 16);
        const serial = ++this.serial;
        this.scope.later(() => { if (this.active && serial === this.serial) this.preview(); }, 90);
    }
    preview() {
        const component = this.appearance.notePreviewView(this.view);
        if (R.valid(component)) {
            this.previewedComponent = component;
            this.appearance.previewChoice(component, this.pending, this.pendingKind === "hat");
        }
    }
    differs() { return Object.keys(C.defaults).some(key => this.pending[key] !== this.settings.choice[key]); }
    currentCard() { return this.selectedInfo || cardInfo.get(R.valid(this.group) ? this.group.GetSelectedButtonBase() : undefined); }
    canResetSelected() {
        const info = this.currentCard();
        return !!info && isEquipped(info) && info.item.id !== C.defaults[info.kind];
    }
    refreshAction() {
        if (!this.active) return;
        this.view.RemoveKeyDelegate.Broadcast("WeaponConfirm");
        const resetSelected = this.canResetSelected(), info = this.currentCard();
        const language = this.settings.language;
        const caption = info ? info.kind === "eye" || info.kind === "sclera" ? C.message(info.kind, language) : C.itemName(info.item, language) : C.message("defaults", language);
        if (R.valid(this.infoTitle)) this.infoTitle.SetPBZFormatText(R.text(caption));
        if (R.valid(this.status)) this.status.SetPBZFormatText(R.text(C.message(info?.kind ?? (this.tab === C.MASK_TAB ? "mask" : "style"), language)));
        const detail = this.infoState?.detail?.widget;
        if (R.valid(detail)) {
            const lines = [];
            if (info?.kind === "style" && info.item.wwmAuthored) lines.push(C.message("contributor", language) + " · OneShotNinja");
            if (this.notice) lines.push(C.message(this.notice, language));
            else if (resetSelected) lines.push(C.message(info.kind === "hat" ? "removeHat" : info.kind === "mask" ? "removeMask" : "restoreSelected", language));
            detail.SetPBZFormatText(R.text(lines.join("  ·  ")));
            detail.SetRenderOpacity(1); detail.SetVisibility(lines.length ? UE.ESlateVisibility.HitTestInvisible : UE.ESlateVisibility.Collapsed);
        }
        this.scope.safe("draw swatch focus", () => this.updateSwatchFocus(info));
        if ((this.differs() || resetSelected || info && info.item.id !== this.settings.choice[info.kind] ||
            info?.kind === "hat" && committedAtelierHat() !== undefined) && NativeUI.canOpenSystemUI(this.view)) this.view.BindKeyDelegate.Broadcast(NativeUI.MakePBZInputDataTableHandle("WeaponConfirm"), true, this.confirmDelegate, UE.EInputEvent.IE_Pressed);
    }
    followOutfit() {
        if (!this.active) return;
        if (!NativeUI.canOpenSystemUI(this.view)) { this.view.pushTips("UI_Character_68"); return; }
        this.pendingKind = null; this.pending = { ...C.defaults }; this.confirm(true); this.preview(); this.group.DeselectAll(); this.selectedInfo = null; this.hoverInfo = null; this.refreshAction();
    }
    openFollowAction() {
        const handle = new UE.DataTableRowHandle(); handle.DataTable = UE.DataTable.Load(C.paths.actionTable); handle.RowName = C.FOLLOW;
        if (!R.valid(handle.DataTable)) throw new Error("Private F action table unavailable; install both package components");
        this.followHandle = handle; this.followBars = []; this.followEntries = new Map();
        // Bind a private PBZ-typed F/Y row. CommonUI's older F row has a different
        // row struct and must not be passed to PBZ's binder. Native priority (-1) supplies
        // the existing slot between WeaponConfirm (-2) and Back (0).
        this.view.BindKeyDelegate.Broadcast(handle, false, this.followDelegate, UE.EInputEvent.IE_Pressed);
        this.view.ChangeInputBar.Broadcast(true, "ShowHat");
        const found = P.$ref(); UE.WidgetBlueprintLibrary.GetAllWidgetsOfClass(this.view, found, R.loadClass(C.paths.actionBar), false);
        const widgets = P.$unref(found);
        this.updateFollow = () => { if (this.active) this.scope.safe("refresh follow outfit action", () => this.decorateFollowAction()); };
        for (let i = 0; i < widgets.Num(); i++) {
            const bar = widgets.Get(i).ActionBar;
            if (R.valid(bar)) { bar.OnActionBarUpdated.Add(this.updateFollow); this.followBars.push(bar); }
        }
        this.decorateFollowAction();
    }
    decorateFollowAction() {
        for (const bar of this.followBars || []) if (R.valid(bar)) {
            const entries = bar.GetAllEntries();
            for (let i = 0; i < entries.Num(); i++) {
                const entry = entries.Get(i);
                if (!R.valid(entry)) continue;
                if (String(entry.InputActionRowName) !== "ShowHat") continue;
                if (!this.followEntries.has(entry)) {
                    this.followEntries.set(entry, { input: entry.InputActions, text: entry.RichText.GetText() });
                    entry.OnButtonBaseClicked.Add(this.followClick);
                }
                entry.InputActions = this.followHandle;
                entry.InputActionWidget.SetInputAction(this.followHandle);
                entry.RichText.SetPBZFormatText(R.text(C.message("restore", this.settings.language)));
            }
        }
    }
    closeFollowAction() {
        for (const bar of this.followBars || []) if (R.valid(bar) && this.updateFollow) bar.OnActionBarUpdated.Remove(this.updateFollow);
        for (const [entry, before] of this.followEntries || []) if (R.valid(entry)) {
            entry.OnButtonBaseClicked.Remove(this.followClick);
            if (String(entry.InputActionRowName) === "ShowHat") {
                entry.InputActions = before.input; entry.InputActionWidget.SetInputAction(before.input); entry.RichText.SetPBZFormatText(before.text);
            }
        }
        this.view.RemoveKeyDelegate.Broadcast(C.FOLLOW);
        this.view.ChangeInputBar.Broadcast(false, "ShowHat");
        this.followBars = []; if (this.followEntries) this.followEntries.clear();
    }
    confirmSelected() {
        const info = this.currentCard();
        if (!this.active || !info || info.page !== this) return;
        if (!NativeUI.canOpenSystemUI(this.view)) { this.view.pushTips("UI_Character_68"); return; }
        const value = this.canResetSelected() ? (info.kind === "hat" ? "none" : C.defaults[info.kind]) : info.item.id;
        this.pendingKind = info.kind;
        this.pending = this.settings.withChoiceField(info.kind, value);
        this.confirm(false, info.kind === "hat");
    }
    confirm(resetColors = false, hatAction = false) {
        if (!this.active) return;
        const changed = this.differs() || resetColors && Object.values(this.settings.hairColors).some(color => color !== C.defaults.color);
        if (!NativeUI.canOpenSystemUI(this.view)) { this.view.pushTips("UI_Character_68"); return; }
        let transferred = false;
        if (hatAction || resetColors) {
            const player = UE.PBZAppearanceComponent.GetPBZAppearanceComponent(R.gi());
            if (R.valid(player)) {
                const outfit = player.GetEffectiveOutfit();
                transferred = resetColors ? compat.claimAtelierHat(outfit) : compat.claimStudioHat(outfit);
            }
        }
        if (!changed && !transferred) return;
        this.pendingKind = null;
        const saved = this.appearance.commit(this.pending, resetColors); this.preview(); this.markEquipped(); this.refreshAction();
        this.view.playOutfitSound(this.view.OutfitChangeSound);
        this.notice = saved ? null : "saveFailed"; this.refreshAction();
    }
    toggleLanguage() {
        const saved = this.settings.setLanguage(this.settings.language === "zh" ? "en" : "zh");
        this.notice = saved ? null : "languageFailed";
        if (this.onLanguageChanged) this.onLanguageChanged(); else this.refreshLanguage();
    }
    refreshLanguage() {
        const language = this.settings.language;
        for (const [key, heading] of this.headings || []) {
            heading.SetStyle(R.loadClass(language === "en" ? C.paths.textStyleEN : C.paths.textStyle));
            heading.SetFont(font(18, language)); heading.SetText(R.text(C.message(key, language)));
        }
        if (R.valid(this.status)) this.refreshAction();
        if (R.valid(this.languageButton)) {
            // The bilingual switch uses the native Chinese font's Latin glyphs.
            this.languageButton.RichText.SetDefaultFont(font(18, "zh"));
            this.languageButton.RichText.SetDefaultColorAndOpacity(tint([1, 1, 1]));
            this.languageButton.RichText.SetPBZFormatText(R.text(C.message("language", language)));
        }
        if (this.active && this.followBars) this.decorateFollowAction();
    }
    markEquipped() {
        for (const info of this.cards) if (R.valid(info.button) && info.equipped !== isEquipped(info)) info.button.applyAppearanceNow();
    }
    position() {
        if (this.positioned || !R.valid(this.root) || typeof this.parentOverlay.GetCachedGeometry !== "function" || typeof this.root.GetDesiredSize !== "function") return;
        const parent = this.parentOverlay.GetCachedGeometry(), size = UE.SlateBlueprintLibrary.GetLocalSize(parent), desired = this.root.GetDesiredSize();
        if (!(size.Y > 0 && desired.Y > 0)) return;
        let top = 270;
        const section = this.host.W_SecondTabLine;
        // The line widget can fill the whole screen; its native text child has
        // the actual section-title bounds needed for positioning the grid.
        const line = R.valid(section) && R.valid(section.LineText) ? section.LineText : section;
        if (R.valid(line) && typeof line.GetCachedGeometry === "function") {
            const geometry = line.GetCachedGeometry(), lineSize = UE.SlateBlueprintLibrary.GetLocalSize(geometry);
            if (lineSize.Y > 0 && lineSize.Y < size.Y * .25) {
                const absolute = UE.SlateBlueprintLibrary.LocalToAbsolute(geometry, R.vec2(0, lineSize.Y));
                const bottom = UE.SlateBlueprintLibrary.AbsoluteToLocal(parent, absolute);
                if (bottom.Y >= 0 && bottom.Y < size.Y * .6) top = bottom.Y + 22;
            }
        }
        top = Math.min(top, Math.max(0, size.Y - 240));
        this.root.SetHeightOverride(Math.max(160, size.Y - top - 80));
        this.overlaySlot.SetPadding(R.margin(95, top, 0, 0)); this.positioned = true;
    }
    tick() {
        if (!this.active) return;
        this.scope.safe("position hair grid", () => this.position());
        this.scope.safe("rebind hair preview", () => {
            const component = this.view.getPreviewDollComponent();
            if (R.valid(component) && (this.previewedComponent !== component || !this.appearance.preview.has(component))) this.preview();
        });
    }
    leave() {
        if (!this.active) return;
        this.active = false; ++this.serial;
        this.pendingKind = null; this.previewedComponent = null; this.hoverInfo = null; this.scope.safe("restore native appearance information", () => this.closeInfo());
        this.scope.safe("remove follow outfit action", () => this.closeFollowAction());
        this.scope.safe("unbind hair action", () => this.view.RemoveKeyDelegate.Broadcast("WeaponConfirm"));
        const component = this.scope.safe("read preview for cleanup", () => this.view.getPreviewDollComponent());
        if (R.valid(component)) this.scope.safe("restore committed preview", () => this.appearance.clearPreview(component));
        const nativeCard = require("UI/Widget/Button/ButtonBaseWeapon");
        for (const info of this.cards) if (R.valid(info.button)) { this.clearCardFeedback(info.button); nativeCard.resetGridSlotHoverAnimation(info.button, info.button.hoverScaleAnimation); }
        if (R.valid(this.root)) this.scope.safe("hide hair content", () => this.root.SetVisibility(UE.ESlateVisibility.Collapsed));
        this.scope.safe("detach swatch focus", () => this.updateSwatchFocus(null));
        if (R.valid(this.languageRoot)) this.scope.safe("hide language switch", () => this.languageRoot.SetVisibility(UE.ESlateVisibility.Collapsed));
        for (const [widget, visibility] of this.hidden.splice(0)) if (R.valid(widget)) this.scope.safe("restore outfit content", () => widget.SetVisibility(visibility));
    }
    clearContent() {
        this.navigationGeneration = (this.navigationGeneration || 0) + 1;
        this.scope.safe("detach swatch focus", () => this.updateSwatchFocus(null));
        this.swatchFrame = null;
        if (R.valid(this.group)) {
            if (typeof this.onSelected === "function") this.scope.safe("remove selection handler", () => this.group.OnSelectedButtonBaseChanged.Remove(this.onSelected));
            if (typeof this.onClicked === "function") this.scope.safe("remove click handler", () => this.group.OnButtonBaseClicked.Remove(this.onClicked));
            if (typeof this.onDoubleClicked === "function") this.scope.safe("remove double-click handler", () => this.group.OnButtonBaseDoubleClicked.Remove(this.onDoubleClicked));
            this.scope.safe("clear hair group", () => this.group.RemoveAll());
        }
        for (const info of this.cards) {
            cardInfo.delete(info.button);
            if (R.valid(info.button)) {
                if (typeof info.onUnhovered === "function") this.scope.safe("remove card unhover handler", () => info.button.OnButtonBaseUnhovered.Remove(info.onUnhovered));
                this.scope.safe("release hair navigation", () => this.unbindNavigation(info.button));
                this.scope.safe("destroy hair card", () => info.button.TsDestruct());
                this.scope.safe("detach hair card", () => info.button.RemoveFromParent());
            }
        }
        this.cards.length = 0; this.rows.length = 0;
        if (R.valid(this.languageButton)) {
            this.scope.safe("release language navigation", () => this.unbindNavigation(this.languageButton));
            this.scope.safe("remove language handler", () => this.languageButton.OnButtonBaseClicked.Remove(this.languageClick));
            this.scope.safe("stop language animations", () => this.languageButton.StopAllAnimations());
            this.scope.safe("detach language button", () => this.languageButton.RemoveFromParent());
        }
        if (R.valid(this.languageRoot)) this.scope.safe("detach language switch", () => this.languageRoot.RemoveFromParent());
        this.languageButton = null; this.languageRoot = null; this.headings = [];
        if (R.valid(this.root)) this.scope.safe("detach hair content", () => this.root.RemoveFromParent());
        this.root = null; this.group = null; this.status = null; this.scroll = null;
        this.parentOverlay = null; this.overlaySlot = null; this.positioned = false;
        this.onSelected = null; this.onClicked = null; this.onDoubleClicked = null; this.built = false;
    }
    stop() {
        this.leave(); this.clearContent();
        pageByView.delete(this.view);
    }
}
exports.HairPage = HairPage;
exports.registerTab = function (host, settings) {
    if (!R.valid(host.TabList)) throw new Error("Native character tab list is unavailable");
    for (const id of [C.TAB, C.MASK_TAB]) registerOneTab(host, settings, id);
};
function registerOneTab(host, settings, id) {
    const tabs = host.TabList;
    const out = P.$ref(new UE.PBZTabDescriptor());
    if (!host.TabList.GetPreregisteredTabInfo("Appearance", out)) throw new Error("Native outfit tab descriptor is unavailable");
    const original = P.$unref(out), desc = new UE.PBZTabDescriptor();
    desc.TabId = id; desc.TabText = flow(C.message(C.tabMessage(id), settings.language)); desc.TabButtonType = original.TabButtonType;
    desc.SwitchSound = original.SwitchSound; desc.bHidden = false;
    for (const [key, path] of [["IconBrush", id === C.MASK_TAB ? C.paths.maskTabIcon : C.paths.tabIcon], ["SelectedIconBrush", id === C.MASK_TAB ? C.paths.maskTabIcon : C.paths.tabSelected]]) {
        const brush = new UE.SlateBrush(), texture = UE.Texture2D.Load(path);
        if (!R.valid(texture) || R.path(texture) !== path) throw new Error("Native hair tab art unavailable");
        brush.DrawAs = UE.ESlateBrushDrawType.Image; brush.ImageType = UE.ESlateBrushImageType.FullColor; brush.ResourceName = "None";
        const nativeSize = original.IconBrush.ImageSize;
        R.brushSize(brush, nativeSize && nativeSize.X > 0 ? nativeSize.X : 48, nativeSize && nativeSize.Y > 0 ? nativeSize.Y : 48);
        brush.ResourceObject = texture; brush.TintColor = tint(id === C.MASK_TAB && key === "SelectedIconBrush" ? [0, 0, 0] : [1, 1, 1]); desc[key] = brush;
    }
    if (!R.valid(tabs.GetTabButton(id)) && !tabs.RegisterDynamicTab(desc)) throw new Error("Native hair tab registration failed");
    // Dynamic registration creates the CommonUI button, but PBZ's native
    // keyboard/controller handlers read these separate ordered caches.
    const descriptors = tabs.PreregisteredTabInfoArray, ids = tabs.TabButtonIDs;
    let hasDescriptor = false, hasID = false;
    for (let i = 0; i < descriptors.Num(); i++) if (String(descriptors.Get(i).TabId) === id) { hasDescriptor = true; break; }
    for (let i = 0; i < ids.Num(); i++) if (String(ids.Get(i)) === id) { hasID = true; break; }
    if (!hasDescriptor) descriptors.Add(desc);
    if (!hasID) ids.Add(id);
    const previous = host.TabList.GetTabButton(id === C.MASK_TAB ? C.TAB : "Appearance"), first = host.TabList.GetTabButton("Character");
    if (R.valid(previous) && R.valid(first) && previous.Slot && first.Slot) {
        const old = previous.Slot.Padding, native = first.Slot.Padding;
        const records = tabSpacing.get(host) || [];
        if (!records.some(x => x.slot === previous.Slot)) records.push({ slot: previous.Slot, old: R.margin(old.Left, old.Top, old.Right, old.Bottom) });
        tabSpacing.set(host, records);
        previous.Slot.SetPadding(R.margin(native.Left, native.Top, native.Right, native.Bottom));
    }
}
exports.refreshTab = function (host, settings) {
    const tabs = host.TabList;
    if (!R.valid(tabs)) return;
    for (const id of [C.TAB, C.MASK_TAB]) {
    const out = P.$ref(new UE.PBZTabDescriptor());
    if (!tabs.GetPreregisteredTabInfo(id, out)) continue;
    const desc = P.$unref(out); desc.TabText = flow(C.message(C.tabMessage(id), settings.language));
    const descriptors = tabs.PreregisteredTabInfoArray;
    for (let i = 0; i < descriptors.Num(); i++) if (String(descriptors.Get(i).TabId) === id) descriptors.Set(i, desc);
    const button = tabs.GetTabButton(id);
    if (R.valid(button)) button.SetTabLabelInfo(desc, false);
    }
};
exports.unregisterTab = function (host) {
    const tabs = host.TabList;
    const spacing = tabSpacing.get(host); if (spacing) { for (const record of spacing) if (R.valid(record.slot)) record.slot.SetPadding(record.old); tabSpacing.delete(host); }
    for (const id of [C.TAB, C.MASK_TAB]) {
    tabs.RemoveTab(id);
    // PBZ keeps its own navigation/label caches in addition to CommonUI tabs.
    for (const name of ["TabButtonIDs", "LockedIDs"]) {
        const a = tabs[name]; for (let i = a.Num() - 1; i >= 0; i--) if (String(a.Get(i)) === id) a.RemoveAt(i);
    }
    const descriptors = tabs.PreregisteredTabInfoArray;
    for (let i = descriptors.Num() - 1; i >= 0; i--) if (descriptors.Get(i).TabId === id) descriptors.RemoveAt(i);
    tabs.PendingTabLabelInfoMap.Remove(id);
    }
};
exports.flow = flow;
