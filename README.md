# PBZ Outfit Framework Combined v0.2.1 — menu compatibility hotfix

A combined installation for personal testing of:
- Soul's Appearance Studio v1.3.3 (Nexus 559, Szy1115)
- Ateliê do Soul (Nexus 1463)
- PBZ Outfit Framework (Nexus 903, Melina)

Preserves the original upstream asset containers without repacking or modifying them. Includes the 22 Appearance Studio triplets plus the Atelier and Framework triplets (24 triplets, 72 cooked files). Studio assets are Git LFS objects and their pointers are not playable files.

## v0.2.1 menu repair
- One logical owner for the native Appearance widget: native Outfit/Atelier, Hair or Masks.
- Native initialization, outfit catalog creation and framework refreshes are no longer suppressed while opening a Studio tab. A ready native preview session is reused for Hair/Masks switches.
- Atelier detaches its native grid listeners before Studio takes ownership. In combined mode it no longer wraps the native refresh/finish methods per widget or forces a second Appearance re-entry. Native confirm/back behavior is restored when leaving Studio.
- The Studio router guards recursive native tab selection, reconciles cached callbacks, retries missing dynamic tab registrations and restores the native grid if a custom overlay fails. It avoids hiding any ancestor of its own overlay. Missing decorative icons fall back to labels; a missing restore-action table has a fallback button.
- 41 appearance checks and 33 menu lifecycle checks passed under mocks; actual game testing is still necessary. The original 72 cooked assets are unchanged. No engine fingerprint checks were bypassed.
- If upgrading from v0.2.0, use the script-only ZIP and replace the two complete Mods Menu script folders; do not reinstall the cooked assets.

## Installation
1. Back up saves and any existing mod files. Close the game.
2. Use a Git LFS-enabled checkout of this repository's main branch and run git lfs pull. Do not use a source archive containing only LFS pointers.
3. Optional but recommended: with Node.js installed, run tools/Build-Release.ps1 to validate binary hashes, all runtime JS, and mock tests before building a ZIP. If using PortableGit, the script defaults to D:\Downloads\Programs\PortableGit\bin\git.exe (override -GitExe as needed). Or run node tools/verify.cjs after setting PBZ_GIT_EXE to the local Git executable.
4. Install the existing PBZ Mods Menu loader separately (hid.dll). This package does not add another loader DLL or UE4SS. Use only the Mods Menu edition of Studio. Disable/remove the duplicate Studio folder at ProjectPBZ/PBZModLoader/mods/PBZSoulHairStudio and remove older original copies of these two script mods before copying the new folders.
5. Copy the packaged ProjectPBZ directory into the game root. Keep the original asset names and do not leave obsolete Studio asset versions installed alongside these triplets. Do not delete unrelated mods.
6. The Studio's original engine/native source fingerprint guards remain active (Steam build 26367565, UE 5.7.4-302256+b7c82f11b864).

## How the shared customization works
- Outfit Framework owns the global appearance catalog. Atelier retains its native outfit row PBZ_OutFit_ACAtelieSoul, slot 8716, body sets, dyes, outfit unlock and wardrobe UI.
- Studio retains its original Hair and Masks tabs, hair/face/eye/mask customization, physics, visual settings and its full 112-color palette; Atelier reads the same palette.
- On Atelier's custom outfit, Atelier owns the native hat slots by default. The Atelier wardrobe's Controle do chapéu option selects either controller. Selecting a hat or hat color in Atelier reclaims control; confirming an explicit Studio hat while the custom outfit is equipped transfers control to Studio. Selecting Restore Defaults in Studio returns control of the Atelier hat to Atelier while resetting Studio choices. Other outfits use Studio's original hat behavior.
- A temporary hat preview is isolated to the active preview doll; it does not change committed ownership or affect the player. Preview transitions suppress Studio writes and clear stale preview context on close/reuse. Body replacement notifications allow Studio to refresh after Atelier swaps a body. Atelier yields to forced-default cinematic appearance.
- Both original script entrypoints are preserved for loader discovery, but share one compatibility coordinator. The duplicate PBZModLoader edition is deliberately omitted. Existing saved preferences are preserved; a new controller field defaults to Atelier.

## Verification and limitations
- All 24 runtime JS modules passed syntax checks. The compatibility test suite passed 41 appearance checks and 33 menu checks with mock UE objects, including hat transitions, preview isolation, shared palette, tab re-entry, input ownership, and native refreshes.
- tools/asset-manifest.json pins the exact Git blobs from the three source branches. tools/verify.cjs verifies all downloaded files against their Git blob/LFS SHA-256 and size, validates IoStore TOC magic, and rejects incomplete/extra cooked triplets.
- Repository asset references are unchanged. The CI build verifies actual LFS binary downloads using the verifier. No Unreal/PuerTS runtime or visual testing was possible here. Third-party mods replacing the global appearance table or slot 8716 are not automatically merged. A confirmed complete standalone game-tested release requires testing in PBZ.

## In-game acceptance test
1. Check the custom Atelier outfit appears; equip it. Switch all six body presets and all hat choices, including no hat; check body/hat dyes.
2. Open the Hair and Masks tabs and test native, NPC and WWM hair, physics, face, masks, iris and sclera, glow and fill light. Switch among normal and custom outfits.
3. Test Atelier-owned hat + Studio hair/mask. Preview a Studio hat without confirming, cancel, and confirm. Switch back in Atelier and test its dye. Confirm Restore Defaults returns ownership to Atelier.
4. Switch tabs with keyboard/mouse and controller, reopen wardrobe, load a save, respawn and test cutscenes/new story cycle. Test another Outfit Framework outfit remains usable.
5. If anything fails, collect PBZModsMenu logs, ACAtelieSoul-status.txt and the Studio console logs. Do not distribute externally without the original authors' permissions.
