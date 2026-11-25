"use strict";
// Stable IDs are saved separately from the game's wardrobe and saves.
exports.ID = "PBZSoulHairStudio";
exports.VERSION = "1.3.3";
exports.ENGINE = "5.7.4-302256+b7c82f11b864";
exports.TAB = "PBZSoulHair";
exports.MASK_TAB = "PBZSoulMasks";
// Removed incomplete hairstyles fall back in memory; keep other saved choices.
exports.retiredStyles = new Set(["npc_mojizi"]);
exports.FOLLOW = "PBZSoulHairFollow";
exports.styles = [
    { id: "outfit", name: "原装发型", row: "" },
    { id: "default", name: "普通", row: "DefaultHairStyle" },
    { id: "motian", name: "传承", row: "HairStyle_MoTian" },
    { id: "yayu", name: "武林传说", row: "HairStyle_YaYu" },
    { id: "guyou", name: "故友", row: "HairStyle_GuYou" },
    { id: "zhuiming", name: "追命", row: "HairStyle_ZhuiMing" },
    { id: "fengxue", name: "风雪", row: "HairStyle_FengXue" },
    { id: "moqu", name: "机械魔躯", row: "HairStyle_JiGuanMoQu" }
];
const legacyHairColors = [
    { id: "native", name: "原色", hex: "#393433", melanin: null },
    { id: "black", name: "墨黑", hex: "#242329", melanin: .65 },
    { id: "brown", name: "深棕", hex: "#49352b", melanin: .28 },
    { id: "chestnut", name: "栗棕", hex: "#79513a", melanin: .14 },
    { id: "ash", name: "灰棕", hex: "#78716a", melanin: .07 },
    { id: "gray", name: "烟灰", hex: "#93999e", melanin: .025 },
    { id: "silver", name: "银灰", hex: "#bdc3cc", melanin: 0 },
    { id: "white", name: "霜白", hex: "#e3e1da", melanin: 0 }
];
const base = "/HuaShira/Characters/Hero/Hero_Hun/SkinParts/";
const nativeCosmetics = require("./cosmetics");
const hairRoot = "/Game/PBZMods/SoulHairStudio/";
const asset = (folder, name) => hairRoot + folder + "/" + name + "." + name;
const wwmFiber = name => asset("WWM/HairSurface", "T_WWM_Fiber133_" + name);
const wwmSurface = {
    Diffuse: wwmFiber("Albedo"), "Alpha(NoVT)": wwmFiber("Opacity"), Normal_map: wwmFiber("Normal"),
    Root: wwmFiber("Root"), Depth: wwmFiber("Depth"), Unique_Hair_Value: wwmFiber("ID")
};
const wwmFiberVariation = .12;
const wwmStrandSets = {
    wwm_longknot: "LongKnot", wwm_ponytail: "Ponytail", wwm_short: "Short",
    wwm_longstraight: "B2_LongStraight", wwm_luxurystraight: "B2_LuxuryStraight", wwm_wavylocks: "B2_WavyLocks"
};
const wwmStrand = (style, role) => asset("WWM/StrandAtlases", "T_WWM_Strands_" + wwmStrandSets[style] + "_" + role);
const penglaiMap = name => asset("WWM/Penglai52", "T_WWM_Penglai52_" + name);
exports.wwmPenglai = {
    material: asset("WWM/Penglai52", "MI_WWM_Penglai52"),
    master: asset("WWM/Penglai52", "MA_WWM_Penglai52"),
    dye: { atlas: penglaiMap("Diffuse"), brightness: .93, valueVariation: .24 },
    textures: {
        Diffuse: penglaiMap("Diffuse"), "Alpha(NoVT)": penglaiMap("Opacity"), Normal_map: penglaiMap("Normal"),
        Root: penglaiMap("Root"), Depth: penglaiMap("Depth"), Unique_Hair_Value: penglaiMap("ID"), HairAO: penglaiMap("AO")
    }
};
// Median sRGB at the crown of each undyed wardrobe icon supplied by the user.
exports.wardrobeHairColors = {
    wwm_long: "#cdcacb", wwm_longknot: "#1a1a1e", wwm_ponytail: "#141111",
    wwm_short: "#7b2922", wwm_longstraight: "#1a1918",
    wwm_luxurystraight: "#c7c3db", wwm_wavylocks: "#dac9c4"
};
exports.nativeStyles = exports.styles.slice(1);
// These eight fitted assets carry the original NPC shapes in Soul's bind pose.
const extraStyles = nativeCosmetics.styles.map(style => {
    if (style.id === "wwm_long" && style.wwmAuthored) {
        const surface = exports.wwmPenglai;
        return {
            ...style, materialProfile: "wwm-penglai-compatible",
            parts: style.parts.map(part => ({ ...part, materials: [surface.material] })),
            batch2Materials: {
                textures: surface.textures,
                scalars: {
                    Brightness: surface.dye.brightness, RandomValueVariation: surface.dye.valueVariation, RandomHueVariation: 0,
                    Roughness: .36, Specular: .125, Scatter: .205, NormalStrength: .52, HairAOStrength: 0,
                    EdgeMaskMin: .98, DensityOffsetPower: .50, "DensityOffsetPower | Close": .50
                },
                vectors: { TangentA: [0, 0, .19, 1], TangentB: [0, 0, -.19, 1] }
            }
        };
    }
    if (style.wwmAuthored) return {
        ...style, batch2Materials: {
            ...style.batch2Materials, textures: {
                Diffuse: wwmStrand(style.id, "Diffuse"), "Alpha(NoVT)": wwmStrand(style.id, "Opacity"),
                Alpha: wwmStrand(style.id, "LegacyOpacity"), Normal_map: wwmStrand(style.id, "Normal"),
                Root: wwmStrand(style.id, "Root"), Depth: wwmStrand(style.id, "Depth"),
                Unique_Hair_Value: wwmStrand(style.id, "ID")
            }, scalars: {
                ...style.batch2Materials.scalars, Brightness: 1, HairAOStrength: .32,
                RandomValueVariation: wwmFiberVariation, NormalStrength: .43,
                EdgeMaskMin: .98, DensityOffsetPower: .50, "DensityOffsetPower | Close": .50
            }
        }
    };
    const part = style.parts[0];
    const nativeMaterials = style.id === "zuoshang" ?
        ["/Game/PBZContent/Characters/EliteBoss/ZuoShang/Material/V02/Hair02/MI_EliteBoss_ZuoShang_P2_HairCard.MI_EliteBoss_ZuoShang_P2_HairCard"] : part.materials;
    const materials = nativeMaterials.map(path => asset("NPC/Materials", path.split(".").pop()));
    return { ...style, nativeNPC: true, parts: [{ ...part, materials }] };
});
exports.styles.push(...extraStyles);
exports.wwmBaseMaterial = asset("WWM/Materials", "MI_ZeroHun_HairCard_Health");
exports.wwmMasterMaterial = asset("WWM/Materials", "MA_HairSheet");
exports.npcOutfitCollision = {
    "/HuaShira/Characters/Hero/Hero_Hun/Hero_Hun_PhysicsAsset.Hero_Hun_PhysicsAsset": asset("NPC/Collision", "Hero_Hun_PhysicsAsset"),
    "/HuaShira/Characters/Hero/Hero_Hun/PA_Hun.PA_Hun": asset("NPC/Collision", "PA_Hun"),
    "/HuaShira/Characters/Hero/Young_Hun/PA_Hun_Young.PA_Hun_Young": asset("NPC/Collision", "PA_Hun_Young")
};
exports.hairFamily = function (id) {
    const style = exports.styles.find(item => item.id === id);
    return style?.wwmAuthored ? "wwm" : style?.nativeNPC ? "npc" : "soul";
};
exports.wwmHairDye = function (style) {
    if (style?.id === "wwm_long") return exports.wwmPenglai.dye;
    const profile = exports.hairDye.wwm;
    return wwmStrandSets[style?.id] ? { ...profile, atlas: style.batch2Materials.textures.Diffuse } : profile;
};
const soulAtlas = suffix => {
    const name = "T_EliteBoss_BaiChiLian_Hair_" + suffix;
    return "/Game/PBZContent/Characters/EliteBoss/BaiChiLian/Textures/" + name + "." + name;
};
const wwmNative = path => hairRoot + "WWM/Native" + path;
exports.wwmBeardTextures = {
    "Alpha(NoVT)": wwmNative(soulAtlas("Alpha_NonVT")),
    Diffuse: wwmNative(soulAtlas("BC")),
    Normal_map: wwmNative(soulAtlas("Nomal")),
    Root: wwmNative(soulAtlas("Root")),
    Unique_Hair_Value: wwmNative(soulAtlas("ID")),
    Depth: wwmNative(soulAtlas("Deph"))
};
exports.hairDye = {
    soul: {
        white: asset("Soul/Textures", "WhitePlaceholder_VT"),
        mask: asset("Soul/Textures", "WhitePlaceholder_Mask"),
        sourceAtlas: soulAtlas("BC"), atlas: asset("Soul/Textures", "T_WWM_Dye40_Soul"), valueVariation: .5
    },
    npc: {
        white: asset("NPC/Textures", "WhitePlaceholder_VT"),
        sourceAtlas: hairRoot + "NPC/Native" + soulAtlas("BC"),
        atlas: asset("NPC/Textures", "T_WWM_Dye40_Soul"), valueVariation: .5
    },
    wwm: { atlas: wwmSurface.Diffuse, brightness: 1, valueVariation: wwmFiberVariation },
    beard: {
        white: wwmNative("/AkashaEffects/MaterialLibrary/Texture/WhitePlaceholder_VT.WhitePlaceholder_VT"),
        sourceAtlas: exports.wwmBeardTextures.Diffuse,
        atlas: asset("WWM/Textures", "T_WWM_Dye40_Soul"), valueVariation: .5
    }
};
exports.masks = [{ id: "none", name: "不戴面具", en: "No Mask" }, ...nativeCosmetics.masks];
exports.faces = [
    { id: "outfit", name: "原装脸型", mesh: "" },
    { id: "soul", name: "魂", mesh: base + "Hun_Head_New.Hun_Head_New" },
    { id: "moqu", name: "机械魔躯", mesh: base + "Hun_Head_New_MoQu.Hun_Head_New_MoQu" },
    { id: "young", name: "青年魂", mesh: "/HuaShira/Characters/Hero/Young_Hun/SkinParts/Hun_Young_Head.Hun_Young_Head" }
];
const legacyEyeColors = [
    { id: "native", name: "原色", hex: "#65544a" },
    { id: "red", name: "赤红", hex: "#ff3535" },
    { id: "amber", name: "琥珀", hex: "#ffb950" },
    { id: "green", name: "翠绿", hex: "#4fd88b" },
    { id: "blue", name: "冰蓝", hex: "#65bfff" },
    { id: "violet", name: "紫晶", hex: "#c582ff" },
    { id: "pink", name: "浅粉", hex: "#ffa4cd" },
    { id: "silver", name: "银白", hex: "#e1edff" }
];
// Dark to light within each row. A tile's stable ID is independent of layout
// and reused by the two eye texture variants.
const paletteRows = [
    ["ink",    "000000 101017 191820 242329 2f2e37 3a3945 464553 535265"],
    ["gray",   "22272b 394149 505b65 717d88 93999e a5afba bdc3cc d9dfe5"],
    ["white",  "74736e 918e85 adaa9f c8c3b8 d6d2c9 e3e1da f0eee8 ffffff"],
    ["brown",  "221714 36271e 49352b 79513a 78716a b38b72 d3ae8e f0d7bb"],
    ["red",    "240a10 4b111c 781a27 a8252e d3353b ff3535 ff7678 ffb8bb"],
    ["orange", "271205 4a230b 75390d a95119 e37023 ff913f ffb36a ffdbaf"],
    ["yellow", "272004 493b06 71600d a78616 d4af23 ffb950 ffe16b fff2b6"],
    ["lime",   "1b2307 33430e 4d6415 68841e 87a92a a6ca46 c5e86c e4f6b1"],
    ["green",  "0b2418 134331 1c6343 298456 36a768 4fd88b 7eebac bbf4d1"],
    ["teal",   "092426 104347 1b6063 258185 31a4a6 50c6c5 82e1db b8f4ec"],
    ["cyan",   "09232e 104154 1b6078 2982a1 37a5c5 5ac9e6 91e1f3 c5f4fd"],
    ["blue",   "0d1830 192f56 284980 3963ae 4e84d5 65bfff 9cd2ff e1edff"],
    ["violet", "1c102d 341d4f 502c75 6c3f9d 9059ca c582ff d9adff f0d6ff"],
    ["pink",   "290e1d 4e1936 74284f a43c73 d1609a ff85b9 ffa4cd ffd3e9"]
];
const familyNames = [
    ["玄黑", "Black"], ["银灰", "Gray"], ["霜白", "White"], ["棕褐", "Brown"],
    ["赤红", "Red"], ["暖橙", "Orange"], ["金黄", "Yellow"], ["黄绿", "Lime"],
    ["翠绿", "Green"], ["松石", "Teal"], ["青蓝", "Cyan"], ["海蓝", "Blue"],
    ["紫罗兰", "Violet"], ["浅粉", "Pink"]
];
const shadeNames = [
    ["极深", "Deepest"], ["深", "Deep"], ["较深", "Dark"], ["中深", "Mid-dark"],
    ["中亮", "Mid-light"], ["亮", "Bright"], ["浅", "Light"], ["极浅", "Lightest"]
];
exports.swatchColumns = 8;
exports.isSwatch = kind => kind === "color" || kind === "eye" || kind === "sclera";
exports.palette = paletteRows.flatMap(([family, shades], row) => shades.split(" ").map((rgb, index) => {
    const tile = family + "_" + (index + 1);
    const brightness = [.2126, .7152, .0722].reduce((sum, weight, channel) => sum + weight * parseInt(rgb.slice(channel * 2, channel * 2 + 2), 16) / 255, 0);
    return { id: tile, tile, hex: "#" + rgb, melanin: .75 * (1 - brightness) ** 2,
        name: familyNames[row][0] + " · " + shadeNames[index][0], en: shadeNames[index][1] + " " + familyNames[row][1] };
}));
function paletteWithLegacy(legacy) {
    const byHex = new Map(legacy.slice(1).map(item => [item.hex, item]));
    return [legacy[0], ...exports.palette.map(item => ({ ...item, ...byHex.get(item.hex) }))];
}
exports.colors = paletteWithLegacy(legacyHairColors);
exports.eyes = paletteWithLegacy(legacyEyeColors);
exports.scleras = [{ id: "native", name: "原色", en: "Original color" }, ...exports.palette];
const npcStyles = extraStyles.filter(style => !style.wwmAuthored);
const wwmStyles = extraStyles.filter(style => style.wwmAuthored);
exports.gridStyles = [...exports.nativeStyles, ...npcStyles, ...wwmStyles];
exports.gridColors = exports.colors.filter(x => x.id !== "native");
exports.gridFaces = exports.faces.filter(x => x.id !== "outfit");
exports.gridEyes = exports.eyes.filter(x => x.id !== "native");
exports.gridScleras = exports.scleras.filter(x => x.id !== "native");
exports.gridMasks = exports.masks.filter(x => x.id !== "none");
// Several headings share the style choice and its saved ID.
exports.sections = [
    ["style", "soulStyles", exports.nativeStyles],
    ["style", "npcStyles", npcStyles],
    ["style", "wwmStyles", wwmStyles],
    ["color", "color", exports.gridColors],
    ["face", "face", exports.gridFaces],
    ["eye", "eye", exports.gridEyes],
    ["sclera", "sclera", exports.gridScleras]
];
exports.hats = [
    ["Hat_Default", "黑伤（逃亡）", "Black Scar (Fugitive)", "HeiShangTaoWang"],
    ["Hat_Default_Climax", "黑伤", "Sanguine", "HeiShangTaoZhuang"],
    ["Hat_MoTian", "传承", "Legacy", "ChuanCheng"],
    ["Hat_YaYu", "武林传说", "Wulin Legend", "WuLinChuanShuo"],
    ["Hat_Fengxue", "风雪", "Blizzard", "FengXue"],
    ["Hat_GuYou", "故友", "Kindred", "GuYou"]
].map(([id, name, en, suffix]) => {
    const icon = "T_SHS_Hat_" + suffix;
    return { id, name, en, icon: "/Game/PBZMods/SoulHairStudio/HatIcons/" + icon + "." + icon };
});
exports.maskSections = [["mask", "mask", exports.gridMasks], ["hat", "hat", exports.hats]];
exports.isOurTab = id => id === exports.TAB || id === exports.MASK_TAB;
exports.sectionsFor = id => id === exports.MASK_TAB ? exports.maskSections : exports.sections;
exports.tabMessage = id => id === exports.MASK_TAB ? "mask" : "tab";
// Display language never changes the saved cosmetic IDs or the game's locale.
const englishNames = {
    style: ["Original hairstyle", "Classic", "Legacy", "Wulin Legend", "Old Friend", "Pursuit", "Frost and Snow", "Mechanical Body"],
    color: ["Original color", "Ink Black", "Dark Brown", "Chestnut", "Ash Brown", "Smoke Gray", "Silver Gray", "Frost White"],
    face: ["Original face", "Soul", "Mechanical Body", "Young Soul"],
    eye: ["Original color", "Crimson", "Amber", "Emerald", "Ice Blue", "Amethyst", "Light Pink", "Silver White"]
};
const lists = { style: exports.styles, color: legacyHairColors, face: exports.faces, eye: legacyEyeColors };
for (const [kind, items] of Object.entries(lists)) items.forEach((item, i) => { item.en ||= englishNames[kind][i]; });
for (const [items, legacy] of [[exports.colors, legacyHairColors], [exports.eyes, legacyEyeColors]]) {
    for (const item of items) item.en = legacy.find(before => before.id === item.id)?.en ?? item.en;
}
const messages = {
    soulStyles: ["魂", "Soul"], npcStyles: ["NPC", "NPC"], wwmStyles: ["燕云十六声", "Where Winds Meet"],
    tab: ["头发", "Hair"], style: ["发型", "Hairstyle"], color: ["发色", "Hair Color"], face: ["脸型", "Face"], mask: ["面具", "Masks"], eye: ["瞳色", "Eye Color"], sclera: ["眼白色", "Sclera Color"],
    removeMask: ["再次确认取下面具", "Confirm again to remove the mask"],
    hat: ["斗笠", "Conical Hats"], removeHat: ["再次确认摘下斗笠", "Confirm again to remove the hat"],
    restoreSelected: ["再次确认恢复此项默认", "Confirm again to restore this option's default"],
    defaults: ["默认外观", "Default appearance"], restore: ["恢复默认", "Restore Defaults"],
    saveFailed: ["外观已应用，设置保存失败", "Appearance applied; settings could not be saved"],
    languageFailed: ["语言已切换，设置保存失败", "Language changed; settings could not be saved"],
    language: ["中文 / English", "English / 中文"],
    contributor: ["素材贡献者", "Assets by"]
};
exports.validLanguage = value => value === "zh" || value === "en";
exports.message = (key, language) => messages[key][language === "en" ? 1 : 0];
exports.itemName = (item, language) => language === "en" ? item.en : item.name;
exports.cardName = (item, language) => language === "en" ? item.cardEN || item.en : item.cardName || item.name;
exports.iconPath = (kind, id) => {
    const item = (kind === "style" ? exports.styles : kind === "hat" ? exports.hats : kind === "mask" ? exports.masks : exports.faces).find(x => x.id === id);
    return item && item.icon || "/Game/PBZMods/SoulHairStudio/Icons/T_SHS_" + kind + "_" + id + ".T_SHS_" + kind + "_" + id;
};
exports.defaults = { style: "outfit", color: "native", face: "outfit", mask: "none", hat: "outfit", eye: "native", sclera: "native" };
exports.eyeGlowMax = 12;
exports.fillIntensity = { default: 4, max: 100 };
exports.eyeGlowLevel = value => Math.round(Math.max(0, Math.min(exports.eyeGlowMax, value)) * 10) / 10;
exports.normalize = value => { const choice = { ...exports.defaults, ...value }; if (exports.retiredStyles.has(choice.style)) choice.style = "outfit"; return choice; };
exports.paths = {
    host: "/Game/PBZContent/UI/UINew/System/Character/WB_CharacterV5.WB_CharacterV5_C",
    appearance: "/Game/PBZContent/UI/UINew/System/Character/W_Appearance_V2.W_Appearance_V2_C",
    card: "/Game/PBZContent/UI/UINew/HUD/W_ButtonBase_Weapon_Appearance.W_ButtonBase_Weapon_Appearance_C",
    tabIcon: "/Game/PBZContent/UI/UINew/System/Character/Texture/T_UI_Hairstyle_Default.T_UI_Hairstyle_Default",
    tabSelected: "/Game/PBZContent/UI/UINew/System/Character/Texture/T_UI_Hairstyle_Selected.T_UI_Hairstyle_Selected",
    maskTabIcon: "/Game/PBZMods/SoulHairStudio/Icons/T_SHS_tab_masks.T_SHS_tab_masks",
    appearanceComponent: "/Game/PBZContent/Blueprint/Character/Player/BP_AppearanceComp.BP_AppearanceComp_C",
    white: "/AkashaEffects/MaterialLibrary/Texture/WhitePlaceholder_VT.WhitePlaceholder_VT",
    whiteMask: "/AkashaEffects/MaterialLibrary/Texture/WhitePlaceholder_Mask.WhitePlaceholder_Mask",
    font: "/Game/PBZContent/UI/Fonts/ZH_FZKaiTi_Font.ZH_FZKaiTi_Font",
    fontEN: "/Game/PBZContent/UI/Fonts/EN_Chaco-Light_Font.EN_Chaco-Light_Font",
    textStyle: "/Game/PBZContent/UI/UINew/System/Character/Textstyle_Main_CN.Textstyle_Main_CN_C",
    textStyleEN: "/Game/PBZContent/UI/UINew/System/Character/Textstyle_Main_EN.Textstyle_Main_EN_C",
    eyeMaterial: "/Game/PBZContent/Characters/Hero/Hun_JiGuanMoQu/Material/T_Hero_Hun_JGMQ_Eyes_Emmsive.T_Hero_Hun_JGMQ_Eyes_Emmsive",
    refractiveEyeMaterial: "/Game/PBZContent/Characters/Hero/Hun_New_V2/Material/MI_ZeroHun_Eye_01.MI_ZeroHun_Eye_01",
    mechanicalEyeBase: "/Game/PBZContent/Characters/Hero/Hun_JiGuanMoQu/Textures/JGMQ_NEW/T_Hero_Hun_MoQu_Eyeball_BC.T_Hero_Hun_MoQu_Eyeball_BC",
    eyeMask: "/Game/PBZMods/SoulHairStudio/T_PupilNeutral.T_PupilNeutral",
    eyePalette: "/Game/PBZMods/SoulHairStudio/EyePalette/",
    eyeGlow: "/Game/PBZMods/SoulHairStudio/EyeGlow/",
    colorStroke: "/Game/PBZMods/SoulHairStudio/ColorIcons/T_SHS_OilPaintStroke.T_SHS_OilPaintStroke",
    actionTable: "/Game/PBZMods/SoulHairStudio/DT_SoulHairActions.DT_SoulHairActions",
    actionBar: "/Game/PBZContent/UI/Foundation/Widgets/BottomBar/WB_PBZTriggerBoundAction.WB_PBZTriggerBoundAction_C"
};
exports.paths.languageButton = "/Game/PBZContent/UI/Foundation/Widgets/BottomBar/WB_TriggerBoundButton.WB_TriggerBoundButton_C";
exports.validChoice = function (value) {
    return !!value && (exports.styles.some(x => x.id === value.style) || exports.retiredStyles.has(value.style)) && exports.colors.some(x => x.id === value.color)
        && (value.face === undefined || exports.faces.some(x => x.id === value.face))
        && (value.mask === undefined || exports.masks.some(x => x.id === value.mask))
        && (value.hat === undefined || value.hat === "outfit" || value.hat === "none" || exports.hats.some(x => x.id === value.hat))
        && (value.eye === undefined || exports.eyes.some(x => x.id === value.eye))
        && (value.sclera === undefined || exports.scleras.some(x => x.id === value.sclera));
};
exports.linear = function (hex) {
    return [1, 3, 5].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); });
};
exports.rowFor = function (choice, outfitRow, sequence) {
    const style = exports.styles.find(x => x.id === choice.style);
    if (!style) throw new Error("Unknown hairstyle");
    if (style.row) return style.row + (sequence ? "_Seq" : "");
    return String(sequence ? outfitRow.OutfitSequenceHairStyleItem : outfitRow.OutfitHairStyleItem);
};
