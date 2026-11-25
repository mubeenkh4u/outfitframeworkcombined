"use strict";
// Tests use mock UE components. They do not claim an Unreal runtime test.
function runCompatibilityTests(sources) {
    const checks=[];
    function check(name, pass) { if (!pass) throw new Error("FAIL: "+name); checks.push(name); }
    function load(name, dependencies={}, global={}) {
        const module={exports:{}};
        new Function("module","exports","require","globalThis",sources[name])(module,module.exports,id=>{
            if (!Object.prototype.hasOwnProperty.call(dependencies,id)) throw new Error("Unexpected mock require: "+id);
            return dependencies[id];
        },global);
        return module.exports;
    }
    for(const [name,source] of Object.entries(sources)) {
        new Function("module","exports","require",source);
        check(name+" parses",true);
    }
    const global={}, compat=load("bridge",{},global);
    check("Both entrypoints share the same coordinator",load("bridge",{},global)===compat);
    const C=load("catalog",{"./cosmetics":load("cosmetics")});
    const paleta=load("paleta",{"PBZModsMenu/Mods/PBZSoulHairStudioMenu/catalog":C});
    const roupas=load("roupas");
    check("All 112 Studio colors available to Atelier",C.palette.length===112 && paleta.opcoes().length===113);
    check("Shared palette IDs and RGB values preserved",C.palette.every(x=>paleta.cor(x.id)?.every((v,i)=>Math.abs(v-C.linear(x.hex)[i])<1e-9)));
    check("Six original Atelier outfits retained",roupas.opcoes.length===6 && Object.keys(roupas.linhas).length===6);
    check("Original Studio defaults valid",C.validChoice(C.defaults));
    const outfit="PBZ_OutFit_ACAtelieSoul", other="PBZ_OutFit_Test";
    let mode="Atelie", bodyChanges=0, atelierReleases=0, studioReleases=0;
    let previews=new WeakSet(), activePage={};
    let player, slotsWritten=0;
    const mesh=(id)=>({id,IsA:()=>true});
    const nativeMesh=mesh("native"), studioMesh=mesh("studio"), atelierMesh=mesh("atelier"), externalMesh=mesh("external");
    const owner={bHidden:false};
    function makeSlot(o,m) { return {m,bHiddenInGame:false,GetOwner:()=>o,IsA:()=>true,GetSkeletalMeshAsset(){return this.m},SetSkeletalMeshAsset(x){this.m=x;slotsWritten++},IsVisible(){return true},SetHiddenInGame(x){this.bHiddenInGame=x;slotsWritten++}}; }
    function makeComp(o) { return {GetOwner:()=>o,"Hun Hat":makeSlot(o,nativeMesh),"Hun Hat01":makeSlot(o,null),bAppliedHatVisible:true,SetMeshAsset(x,s){s.m=x;slotsWritten++},ApplyHatVisibilityVisual(x){this.bAppliedHatVisible=x;slotsWritten++},IsHatHiddenForOutfit:()=>false}; }
    player=makeComp(owner);
    const dollOwner={bHidden:false}, doll=makeComp(dollOwner);
    const ids=C.hats.map(x=>x.id);
    const nativeId=ids.find(x=>x==="Hat_Fengxue")||ids[0], overrideId=ids.find(x=>x!==nativeId);
    const UE={SkeletalMeshComponent:{StaticClass:()=>1},SkeletalMesh:{StaticClass:()=>2},EAppearanceType:{Hat:1},KismetSystemLibrary:{IsValidSoftObjectReference:x=>!!x,LoadAsset_Blocking:x=>x},PBZAppearanceComponent:{GetAppearanceStruct:id=>({AppearanceType:1,HatAsset:id===nativeId?nativeMesh:studioMesh,bHatUseSkinComponent:false}),GetPBZAppearanceComponent:()=>player}};
    const R={valid:x=>!!x&&x.valid!==false,gi:()=>({})};
    const Hats=load("hats",{"ue":UE,"./runtime":R,"./catalog":C,"./combined-compat":compat});
    const records=new WeakMap();
    const getRecord=c=>{if(!records.has(c))records.set(c,{});return records.get(c)};
    const nativeFor=(id,c)=>({outfit:id,row:{OutfitHatItem:nativeId},wardrobePreview:c===doll});
    const unregisterA=compat.registerAtelier({
        controller:()=>mode,hatRow:()=>nativeId,
        claimStudioHat(){if(mode==="Studio")return false;mode="Studio";return true},
        claimAtelierHat(){if(mode==="Atelie")return false;mode="Atelie";return true},
        releaseHat(c){atelierReleases++;if(c["Hun Hat"].m===atelierMesh)c["Hun Hat"].m=nativeMesh;}
    });
    check("Atelier fallback works before Studio loads",compat.atelierOwnsHat(outfit,player));
    const registerS=()=>compat.registerStudio({previewHat:c=>previews.has(c),previewPage:()=>activePage,hasHat:c=>!!getRecord(c).hatOverride,
        releaseHat(c,id){studioReleases++;Hats.release(c,getRecord(c),nativeFor(id,c))},
        bodyChanged(c){if(c===player)bodyChanges++}
    });
    let unregisterS=registerS();
    check("Atelier has default control, only for its outfit",compat.atelierOwnsHat(outfit,player)&&!compat.atelierOwnsHat(other,player));
    check("Outfit lookup is case insensitive",compat.isAtelier(outfit.toUpperCase()));
    let duplicate=false;try{registerS()}catch(e){duplicate=true}
    check("Duplicate Studio registration rejected",duplicate);
    player["Hun Hat"].m=atelierMesh;doll["Hun Hat"].m=atelierMesh;
    slotsWritten=0;Hats.apply(player,getRecord(player),nativeFor(outfit,player),overrideId);
    check("Studio cannot overwrite Atelier's active hat",player["Hun Hat"].m===atelierMesh&&slotsWritten===0);
    previews.add(doll);
    check("Hat preview affects only its own doll",!compat.atelierOwnsHat(outfit,doll)&&compat.atelierOwnsHat(outfit,player));
    check("Preview does not alter committed hat marker",compat.atelierHatRow(outfit,doll)===nativeId);
    Hats.apply(doll,getRecord(doll),nativeFor(outfit,doll),overrideId);
    check("Atelier releases its material/mesh before Studio preview",atelierReleases===1&&doll["Hun Hat"].m===studioMesh&&player["Hun Hat"].m===atelierMesh);
    previews.delete(doll);compat.releaseStudioHat(doll,outfit);
    check("Ending preview restores native hat before Atelier reapplies",studioReleases===1&&doll["Hun Hat"].m===nativeMesh&&!getRecord(doll).hatOverride);
    check("Studio can take committed ownership",compat.claimStudioHat(outfit)&&!compat.atelierOwnsHat(outfit,player));
    check("Repeated Studio selection is idempotent",!compat.claimStudioHat(outfit));
    Hats.apply(player,getRecord(player),nativeFor(outfit,player),overrideId);
    check("Studio selected hat applies",player["Hun Hat"].m===studioMesh);
    Hats.apply(player,getRecord(player),nativeFor(outfit,player),"none");
    check("Studio hide clears the hat and native visual flag",!player["Hun Hat"].m&&Hats.isOff(player,outfit));
    check("Reset returns committed ownership to Atelier",compat.claimAtelierHat(outfit)&&compat.atelierOwnsHat(outfit,player));
    compat.releaseStudioHat(player,outfit);
    check("Returning ownership restores native hat visibility",player["Hun Hat"].m===nativeMesh&&player.bAppliedHatVisible);
    const external=makeComp({bHidden:false});
    Hats.apply(external,getRecord(external),nativeFor(other,external),overrideId);
    external["Hun Hat"].m=externalMesh;
    slotsWritten=0;Hats.release(external,getRecord(external),nativeFor(other,external));
    check("Cleanup preserves a third-party replacement",external["Hun Hat"].m===externalMesh&&slotsWritten===0&&!getRecord(external).hatOverride);
    check("Other framework outfit cannot change Atelier ownership",!compat.claimStudioHat(other)&&!compat.claimAtelierHat(other));
    compat.notifyBodyChanged(player);
    check("Body replacement notification is delivered once",bodyChanges===1);
    check("Active Studio page is exposed",compat.studioPreviewPage()===activePage);
    unregisterS();
    check("Atelier remains functional if Studio stops",compat.atelierOwnsHat(outfit,player)&&compat.studioPreviewPage()===null);
    unregisterS=registerS();
    check("Studio can restart without stale registration",compat.studioPreviewPage()===activePage);
    const {Appearance}=load("appearance",{"ue":UE,"puerts":{},"./catalog":C,"./runtime":R,"./accessories":{Accessories:class{}},"./hats":Hats,"./combined-compat":compat});
    const a=Object.create(Appearance.prototype);
    Object.assign(a,{preview:new Map(),previewHatIntent:new WeakSet(),outfitOverrides:new WeakMap(),previewViews:new Map(),previewOwners:new WeakMap(),retiredPreviews:new WeakSet(),apply(){}});
    let displayed=outfit,current=doll,active=dollOwner;
    const view={IsVisible:()=>true,previewPhase:0,getPreviewDollComponent:()=>current,getPreviewGameMode:()=>({getActivePreviewDoll:()=>active}),getDisplayedPreviewOutfitID:()=>displayed};
    check("Preview binds the active doll and its displayed outfit",a.notePreviewView(view)===doll&&a.outfitOverrides.get(doll)===outfit);
    a.previewChoice(doll,C.defaults,true);
    check("An explicit hat preview registers even for an unchanged choice",a.previewHatIntent.has(doll));
    a.previewChoice(doll,C.defaults,false);
    check("Non-hat preview releases the temporary hat claim",!a.previewHatIntent.has(doll));
    view.previewPhase=1;displayed=other;a.notePreviewView(view);
    check("Dissolve transition blocks writes and keeps the last stable context",a.previewBusy(doll)&&a.outfitOverrides.get(doll)===outfit);
    view.previewPhase=0;a.notePreviewView(view);
    check("Stable preview updates displayed outfit",!a.previewBusy(doll)&&a.outfitOverrides.get(doll)===other);
    const secondOwner={bHidden:false},second=makeComp(secondOwner);
    a.previewChoice(doll,C.defaults,true);current=second;active=secondOwner;
    a.notePreviewView(view);
    check("Reusing a view retires old preview actor and clears its claim",a.retiredPreviews.has(doll)&&!a.previewHatIntent.has(doll)&&!a.outfitOverrides.has(doll)&&a.previewOwners.get(second)===view);
    a.previewChoice(second,C.defaults,true);a.clearPreviewView(view);
    check("Closing a view clears all temporary selection state",!a.preview.has(second)&&!a.previewHatIntent.has(second)&&!a.outfitOverrides.has(second)&&a.retiredPreviews.has(second));
    unregisterS();unregisterA();
    check("Removing both mods clears shared ownership",!compat.atelierOwnsHat(outfit,player)&&!compat.studioHasHat(player));
    return checks;
}
module.exports = runCompatibilityTests;
