# Upgrade to v0.2.2 — native menu lifecycle repair

1. Exit the game completely.
2. Back up and remove only the two folders under ProjectPBZ/Content/JavaScript/PBZModsMenu/Mods: PBZSoulHairStudioMenu and ACAtelieSoulCor.
3. Extract the menu patch ZIP into the game root. Keep the 72 cooked files, existing Mods Menu loader, and Saved preferences. Do not install a duplicate PBZModLoader edition.
4. Start the game, enter Appearance/Outfit, select Hair, select Masks, return to Outfit and open the custom Atelier card. Repeat with controller if available.
5. If the menus still fail, send ProjectPBZ/Saved/PBZCombined-menu.log (or locate it in the actual project Saved directory), PBZModsMenu-log.txt and ACAtelieSoul-status.txt. The new log should contain startup menu repair 0.2.2, tabs-registered, native-tab, native-bp-init and overlay-active or route-error entries.
6. If PBZCombined-menu.log is missing, send the loader and runtime logs and verify both script folders were replaced.

This patch does not change PAK, UTOC, UCAS, graphics settings or engine version guards. 79 simulated checks passed; real in-game behavior remains unverified.
