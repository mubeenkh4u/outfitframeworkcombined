# PBZ Outfit Framework Combined — compatibility candidate 0.1.0

**Not a complete release.** The Appearance Studio source branch contains only ~5.8 MB of files and an incomplete ExpansionPhysics container. The original archive is ~465 MB compressed. Restore all missing original Studio assets before testing. Do not install the incomplete ExpansionPhysics PAK alone.

## Components
- Soul's Appearance Studio 1.3.3 (Nexus 559, Szy1115)
- Ateliê do Soul (Nexus 1463)
- PBZ Outfit Framework (Nexus 903, Melina)
- Existing PBZ Mods Menu loader required separately; no additional DLL supplied.

The framework's global appearance table and Atelier slot 8716 remain separate cooked containers. The two original Mods Menu entries remain discoverable, with a shared compatibility module. No original branch is altered.

## Installation / test
1. Back up saves and installed mods. Use the complete original Studio asset triplets, including the missing assets not present in GitHub. Keep the original names and paths.
2. Install the framework triplet in ProjectPBZ/Content/Paks/~mods and the Atelier triplet in the same directory. Remove old duplicate copies of these scripts, and do not install a second Studio loader edition.
3. Overlay the two patched JavaScript directories from this repository. Preserve the original asset files that are absent here. Never install a lone .pak from an incomplete IoStore triplet.
4. Start the game using the Studio-supported native build (Steam 26367565 / UE 5.7.4-302256+b7c82f11b864).
5. In Atelier, choose a body, hat, and dye. The new Controle do chapéu option chooses Atelier or Studio ownership. Selecting Atelier's hat or hat color takes ownership back. Confirming a Studio hat while Atelier is equipped hands ownership to Studio. The two saved selections are separate.
6. Verify all six body sets, all original hats, garment and hat dye, hair, faces, masks, eyes, sclera, glow, lighting, keyboard/controller navigation, switching tabs, preview, respawn, cutscenes, save/reload and disable/re-enable. Verify another framework outfit remains unaffected.

## Limitations
Static source integration only; no Unreal runtime test. Cooked package internals not rebuilt. Native fingerprint checks retained. Missing Studio assets prevent a complete standalone release. Preserve author attribution and respect original distribution permissions.
