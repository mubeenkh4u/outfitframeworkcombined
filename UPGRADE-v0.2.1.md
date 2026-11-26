# Upgrade v0.2.0 to v0.2.1 (menu repair)

1. Exit Phantom Blade Zero completely.
2. Back up and remove only these two folders:
   - ProjectPBZ/Content/JavaScript/PBZModsMenu/Mods/PBZSoulHairStudioMenu
   - ProjectPBZ/Content/JavaScript/PBZModsMenu/Mods/ACAtelieSoulCor
3. Extract this patch's ProjectPBZ folder into the game root. Keep all 72 cooked asset files from v0.2.0 and your existing hid.dll.
4. Do not install a second PBZModLoader copy of Appearance Studio. Preserve all Saved preferences.
5. Test Appearance/Outfit -> Hair -> Masks -> Appearance/Outfit, including keyboard/controller, and open Atelier's custom outfit card. Test switching while Atelier is editing an outfit.
6. If the problem persists, send the Mods Menu loader log, Mods Menu log and ACAtelieSoul-status.txt. Search for [PBZ Combined UI] and [Combined UI] and any native method changed errors.

The patch does not change PAK, UTOC or UCAS files. 74 simulated checks passed; live Unreal menu behavior remains unverified.
