"use strict";
// Native menu lifecycle mocks; no Unreal engine is loaded.
function runMenuTests(sources) {
    const checks = [];
    const check = (name, pass) => { if (!pass) throw Error("FAIL: " + name); checks.push(name); };
    const shared = {};
    function load(name, deps = {}, global = shared) {
        const module = { exports: {} };
        new Function("module", "exports", "require", "globalThis", sources[name])(module, module.exports, id => {
            if (!Object.prototype.hasOwnProperty.call(deps,id)) throw Error("Missing test dependency " + id);
            return deps[id];
        }, global);
        return module.exports;
    }
    const compat = load("bridge");
    const events = [], timers = [], repeats = [], pages = new WeakMap();
    const C = { TAB:"PBZSoulHair", MASK_TAB:"PBZSoulMasks", paths:{host:"H",appearance:"A",card:"B"},
        isOurTab:id=>["PBZSoulHair","PBZSoulMasks"].includes(id), message:key=>key, tabMessage:id=>id, VERSION:"test", gridStyles:[],gridMasks:[] };
    const V = { Collapsed:0, Visible:1, SelfHitTestInvisible:2, HitTestInvisible:3 };
    const UE = { ESlateVisibility:V, KismetSystemLibrary:{IsValid:x=>!!x&&!x.invalid},
        PBZAppearanceComponent:{GetPBZAppearanceComponent:()=>null} };
    const R = { valid:x=>!!x&&!x.invalid, guard(){}, fingerprint:()=> "expected" };
    const A = {}, H = {}, B = {};
    for (const name of ["createSlots","refreshAllSlots","updateUnifiedText","refreshHatInputBar","refreshReplaceOutfitInputBar"])
        A[name] = function () { events.push("native:"+name); };
    A.BP_InitWidget = function () {
        events.push("native:init"); if (this.finishDuringInit) this.FinishCurrentWidget(false); this.inputBarSuspended=false;
        this.createSlots(); this.updateUnifiedText(); this.refreshAllSlots(); this.refreshReplaceOutfitInputBar();
    };
    A.FinishCurrentWidget = function () { events.push("native:finish"); this.inputBarSuspended=true; };
    A.Destruct=function(){events.push("native:destruct");};
    A.Tick=function(){events.push("native:tick");};
    H.BP_FirstInitWidget=function(){events.push("host:first");};
    H.BP_InitWidget=function(){events.push("host:init");};
    H.onTabSelected=function(tab){
        events.push("native:tab:"+tab);
        if(tab==="Appearance") {
            this.selected="Appearance"; this.index=1;
            if(this.simulateRecursive) this.onTabSelected("Appearance");
            this.W_Appearance_V2.FinishCurrentWidget(false);
            this.W_Appearance_V2.BP_InitWidget();
        } else {this.selected=tab; this.index=0;}
    };
    for(const name of ["applyIconDesaturate","applyIconSize","applyAppearanceNow","DoSelectedApperanace","BP_OnHovered","OnMouseEnter"]) B[name]=function(){};
    const Native={requiredGameMode:[],methods:{UI_Widget_Character_V3:{},UI_Widget_Appearance:{},UI_Widget_Button_ButtonBaseWeaponAppearance:{}}};
    class Scope {
        constructor(){this.active=true; this.cleanups=[];}
        safe(where,fn){try{return fn()}catch(e){events.push("error:"+where+":"+e.message);}}
        report(where,e){events.push("error:"+where+":"+e.message);}
        log(s){events.push("log:"+s);}
        later(fn){timers.push(fn);}
        repeat(fn,ms){repeats.push({fn,ms});}
        cleanup(fn){this.cleanups.push(fn);}
        patch(owner,name,wrapper){const base=owner[name];owner[name]=function(...args){return wrapper.call(this,base,...args);};}
        stop(){this.active=false;for(const fn of this.cleanups.reverse()) fn();}
    }
    R.Scope=Scope;
    R.Settings=class{constructor(){this.language="en";}readVisualSettings(){}registerVisualMenu(){}};
    class Appearance {
        constructor(){this.records=new Map();this.previewHatIntent=new WeakSet();this.playerFill={};}
        clearPreviewView(){events.push("preview:clear");}
        notePreviewView(){return null;}
        tick(){}
    }
    const U={
        pageByView:pages,cardInfo:new WeakMap(),flow:x=>x,
        registerTab(host){host.registered=true;},tabsReady(host){return !!host.registered;},refreshTab(){},unregisterTab(){},
        HairPage:class{
            constructor(scope,appearance,settings,host){this.view=host.W_Appearance_V2;this.host=host;this.active=false;pages.set(this.view,this);}
            setTab(tab){this.tab=tab;}
            open(){events.push("overlay:open:"+this.tab);if(this.host.failBuild)throw Error("simulated build failure");this.active=true;}
            leave(){if(this.active)events.push("overlay:leave:"+this.tab);this.active=false;}
            stop(){this.leave();pages.delete(this.view);}
            tick(){}
            markEquipped(){events.push("overlay:markers");}
            refreshAction(){events.push("overlay:input");}
        }
    };
    const atelierEvents=[];
    let observerView;
    const unregister=compat.registerAtelier({
        suspendMenu(view){atelierEvents.push("suspend");events.push("atelier:suspend");if(observerView===view)observerView=null;},
        nativeInputRefreshed(view){atelierEvents.push("native-input");observerView=view;},
        controller:()=>"Atelie"
    });
    const module=load("studio",{"ue":UE,"puerts":{},"./catalog":C,"./runtime":R,"./ui":U,"./contract":Native,
        "./combined-compat":compat,"./hats":{},"./appearance":{Appearance},
        "UI/Widget/Appearance":{AppearanceMixinInterface:{prototype:A}},
        "UI/Widget/Character_V3":{CharacterUI_V3MixinInterface:{prototype:H}},
        "UI/Widget/Button/ButtonBaseWeaponAppearance":{ButtonBaseWeaponAppearanceInterface:{prototype:B}},
        "Gameplay/GameModeBuild":{GameModeBuildMixinInterface:{prototype:{}}},
        "UI/Widget/Button/ButtonBaseWeapon":{},"Library/UIHelper":{default:{}}});
    check("Both menu providers register",module.ready===true&&compat.studioRegistered());
    function makeHost() {
        const host=Object.assign(Object.create(H),{index:0,selected:"Character",simulateRecursive:true,IsVisible:()=>true});
        host.W_Appearance_V2=Object.assign(Object.create(A),{inputBarSuspended:true,IsVisible:()=>true,W_SystemPanel:{}});
        host.WidgetSwitcher_31={GetActiveWidgetIndex:()=>host.index};
        host.W_SecondTabLine={InitDataByText:x=>events.push("title:"+x)};
        host.TabList={GetSelectedTabId:()=>host.selected,SelectTabByID(id){host.selected=id;host.onTabSelected(id);},GetTabButton:id=>host.registered?{}:null,OnTabSelected:{fn:null,Add(fn){this.fn=fn;},Remove(fn){if(this.fn===fn)this.fn=null;}}};
        return host;
    }
    const host=makeHost(), view=host.W_Appearance_V2;
    host.BP_InitWidget();
    check("Native host initialization registers dynamic tabs",host.registered);
    host.selected=C.TAB;events.length=0;
    host.onTabSelected(C.TAB);
    check("Initial custom tab reserves UI before native entry",events.indexOf("atelier:suspend")<events.indexOf("native:tab:Appearance"));
    check("Native recursive Appearance selection executes only once",events.filter(x=>x==="native:tab:Appearance").length===1);
    check("Native initialization and outfit catalog run before overlay",events.includes("native:init")&&events.indexOf("native:createSlots")<events.indexOf("overlay:open:"+C.TAB));
    check("Native Finish inside transition does not lose custom tab",pages.get(view)?.active&&compat.studioMenuTab(view)===C.TAB&&host.selected===C.TAB);
    check("Native text and action updates are allowed during initialization",events.includes("native:updateUnifiedText")&&events.includes("native:refreshReplaceOutfitInputBar"));
    events.length=0;view.createSlots();view.refreshAllSlots();view.refreshReplaceOutfitInputBar();view.refreshHatInputBar();
    check("Active overlay protects custom content from native catalog refresh",!events.includes("native:createSlots")&&!events.includes("native:refreshAllSlots")&&events.includes("overlay:markers"));
    check("Studio owns confirm and hat input during its overlay",events.includes("overlay:input")&&!events.includes("native:refreshHatInputBar")&&!events.includes("native:refreshReplaceOutfitInputBar"));
    host.selected=C.MASK_TAB;events.length=0;host.onTabSelected(C.MASK_TAB);
    check("Hair to Masks follows upstream native finish and initialization",events.includes("native:tab:Appearance")&&events.includes("native:finish")&&events.includes("native:init")&&events.includes("overlay:leave:"+C.TAB)&&events.includes("overlay:open:"+C.MASK_TAB));
    check("Masks route owns the shared view",compat.studioMenuTab(view)===C.MASK_TAB&&pages.get(view)?.active);
    view.finishDuringInit=true; view.BP_InitWidget(); view.finishDuringInit=false;
    check("Native re-init opens overlay only after native initialization",pages.get(view)?.active&&compat.studioOwnsMenu(view));
    while(timers.length)timers.shift()();
    check("Overlay resumes after native re-init",pages.get(view)?.active&&compat.studioMenuTab(view)===C.MASK_TAB);
    host.selected="Appearance";events.length=0;host.onTabSelected("Appearance");
    check("Returning to Outfit releases custom overlay first",events.indexOf("overlay:leave:"+C.MASK_TAB)<events.indexOf("native:tab:Appearance")&&!compat.studioOwnsMenu(view));
    check("Atelier can reattach native confirm after leaving Studio",observerView===view&&events.includes("native:refreshReplaceOutfitInputBar"));
    host.selected=C.TAB;host.onTabSelected(C.TAB);view.FinishCurrentWidget(false);
    check("Closing the native view releases the overlay and lease",!compat.studioOwnsMenu(view)&&!pages.get(view)?.active);
    const failing=makeHost();failing.failBuild=true;failing.selected=C.MASK_TAB;
    failing.onTabSelected(C.MASK_TAB);
    check("A build failure releases the view reservation",!compat.studioOwnsMenu(failing.W_Appearance_V2));
    while(timers.length)timers.shift()();
    check("Build failure returns safely to native outfit tab",failing.selected==="Appearance");
    const missed=makeHost();missed.BP_InitWidget();
    missed.selected=C.TAB;
    const poll=repeats.find(x=>x.ms===250).fn;
    poll();
    check("Cached native tab callback is recovered by selected-tab reconciliation",pages.get(missed.W_Appearance_V2)?.active&&compat.studioMenuTab(missed.W_Appearance_V2)===C.TAB);
    missed.selected="Appearance";poll();
    check("Cached return to outfit releases the previous custom overlay",!pages.get(missed.W_Appearance_V2)?.active&&!compat.studioOwnsMenu(missed.W_Appearance_V2));
    const direct=makeHost();direct.BP_InitWidget();direct.selected=C.MASK_TAB;direct.TabList.OnTabSelected.fn(C.MASK_TAB);
    while(timers.length)timers.shift()();
    check("CommonUI selected-tab delegate recovers a cached native callback",pages.get(direct.W_Appearance_V2)?.active&&compat.studioMenuTab(direct.W_Appearance_V2)===C.MASK_TAB);
    const early=makeHost();early.W_Appearance_V2.IsVisible=()=>false;early.selected=C.TAB;early.onTabSelected(C.TAB);
    check("Native BP_InitWidget opens custom overlay before view visibility settles",pages.get(early.W_Appearance_V2)?.active&&compat.studioMenuTab(early.W_Appearance_V2)===C.TAB);
    const token1=compat.reserveStudioMenu(view,C.TAB),token2=compat.reserveStudioMenu(view,C.MASK_TAB);
    check("Stale cleanup cannot release a newer reservation",!compat.releaseStudioMenu(token1)&&compat.studioMenuTab(view)===C.MASK_TAB);
    compat.releaseStudioMenu(token2);
    check("Explicit release restores native UI ownership",!compat.studioOwnsMenu(view));

    // Exercise the real Studio visibility routine, not a duplicate model.
    const tabP={$ref:value=>({value}),$unref:ref=>ref.value};
    Object.assign(UE,{PBZTabDescriptor:class{},FlowLocText:class{},SlateBrush:class{},SlateColor:class{},
        Texture2D:{Load:path=>({path})},ESlateBrushDrawType:{Image:1},ESlateBrushImageType:{FullColor:1},
        ESlateColorStylingMode:{UseColor_Specified:1}});
    Object.assign(R,{text:x=>x,path:x=>x.path,rgba:x=>x,brushSize(){}});
    Object.assign(C.paths,{tabIcon:"hair",tabSelected:"hair-selected",maskTabIcon:"masks"});
    const actualUI=load("ui",{"ue":UE,"puerts":tabP,"./catalog":C,"./runtime":R,"./combined-compat":compat,"Library/UIHelper":{default:{}},"UI/Widget/Button/GridSelectionTransition":{}});
    const rows=items=>({items,Num(){return this.items.length},Get(i){return this.items[i]},Add(x){this.items.push(x)}});
    const original={TabId:"Appearance",TabButtonType:1,SwitchSound:null,IconBrush:{ImageSize:{X:48,Y:48}}};
    const registered=new Map([["Appearance",{}],["Character",{}]]);
    const nativeTabs={PreregisteredTabInfoArray:rows([original]),TabButtonIDs:rows(["Appearance"]),
        GetPreregisteredTabInfo(id,out){if(id!=="Appearance")return false;out.value=original;return true;},
        GetTabButton:id=>registered.get(id),RegisterDynamicTab(desc){registered.set(desc.TabId,{}); /* native void return */}};
    const actualHost={TabList:nativeTabs};
    actualUI.registerTab(actualHost,{language:"en"});
    check("Real tab registration accepts a native void return when the button exists",actualUI.tabsReady(actualHost));
    nativeTabs.TabButtonIDs.items=["Appearance"];nativeTabs.PreregisteredTabInfoArray.items=[original];
    check("Existing tab buttons do not hide missing navigation caches",!actualUI.tabsReady(actualHost));
    actualUI.registerTab(actualHost,{language:"en"});actualUI.registerTab(actualHost,{language:"en"});
    check("Actual tab registration repairs both caches without duplicates",actualUI.tabsReady(actualHost)&&nativeTabs.TabButtonIDs.Num()===3&&nativeTabs.PreregisteredTabInfoArray.Num()===3);
    const mkWidget=(parent,visibility=V.Visible)=>({parent,visibility,GetParent(){return this.parent},GetVisibility(){return this.visibility},SetVisibility(v){this.visibility=v}});
    const outer=mkWidget(null),parent=mkWidget(outer),root=mkWidget(parent),grid=mkWidget(parent),text=mkWidget(parent);
    const page={active:true,root,view:{W_SystemPanel:grid,ScaleBox_0:outer,PBZCommonLocRichText_0:text},hidden:[]};
    actualUI.HairPage.prototype.hideNativeContent.call(page);
    check("Custom overlay ancestors never collapse",outer.visibility===V.Visible&&parent.visibility===V.Visible&&root.visibility===V.Visible);
    check("Only outgoing native content collapses",grid.visibility===V.Collapsed&&text.visibility===V.Collapsed&&page.hidden.length===2);
    grid.visibility=V.Visible;actualUI.HairPage.prototype.hideNativeContent.call(page);
    check("Native refresh cannot permanently reveal the outfit grid over Studio",grid.visibility===V.Collapsed&&page.hidden.length===2);
    unregister();
    // Exercise actual Atelier observer/hook gating with a native outfit view.
    const listeners=()=>({fns:new Set(),Add(fn){this.fns.add(fn)},Remove(fn){this.fns.delete(fn)}});
    const group={OnButtonBaseClicked:listeners(),OnSelectedButtonBaseChanged:listeners(),GetSelectedButtonBase:()=>card};
    const card={AccessoryOutFitID:"PBZ_OutFit_ACAtelieSoul"};
    const controller={IsLocalPlayerController:()=>true,GetViewTarget:()=>point};
    const point={}, pawn={}, doll={bHidden:false}, game={};
    const nativeMixin={confirmOutfit(){calls.confirm++;},BackInput(){calls.back++;}};
    const blueprint=Object.create(nativeMixin);
    const calls={confirm:0,back:0,bind:0};
    const av=Object.assign(Object.create(blueprint),{IsVisible:()=>true,GetParent:()=>null,GetOwningPlayer:()=>controller,
        inputBarSuspended:false,previewPhase:0,appearanceComponent:{GetCurrentOutfit:()=>card.AccessoryOutFitID},
        W_SystemPanel:{ButtonGroup:group,IsVisible:()=>true,GetParent:()=>null},
        getPreviewGameMode:()=>({AppearancePreviewPoint:point,getActivePreviewDoll:()=>doll}),
        refreshReplaceOutfitInputBar(){compat.afterNativeInputRefresh(this);},
        ensureReplaceOutfitLambda(){this.replaceOutfitLambda=()=>{};},
        BindKeyDelegate:{Broadcast(){calls.bind++;compat.afterNativeInputRefresh(av);}}
    });
    let selected="Appearance";
    const ah={W_Appearance_V2:av,IsVisible:()=>true,GetParent:()=>null,GetOwningPlayer:()=>controller,
        TabList:{GetSelectedTabId:()=>selected},WidgetSwitcher_31:{GetActiveWidgetIndex:()=>1}};
    const pageClass={},hostClass={};
    const arr=x=>({Num:()=>x.length,Get:i=>x[i]});
    const aUE={KismetSystemLibrary:{IsValid:R.valid},WidgetSwitcher:{StaticClass:()=>({})},
        UserWidget:{},NewArray:()=>arr([]),Object:{Find:p=>p.includes("W_Appearance_V2")?pageClass:hostClass},
        WidgetBlueprintLibrary:{GetAllWidgetsOfClass(g,ref,cls){ref.value=arr(cls===pageClass?[av]:[ah]);}},
        GameplayStatics:{GetPlayerController:()=>controller,GetPlayerPawn:()=>pawn},
        EInputEvent:{IE_Pressed:1},ESlateVisibility:V};
    const ap={ $ref:x=>({value:x}), $unref:r=>r.value, blueprint:{tojs:()=>({prototype:blueprint})}};
    const wardrobe=load("atelier",{"PBZModsMenu/Mods/PBZSoulHairStudioMenu/combined-compat":compat});
    const input={MakePBZInputDataTableHandle:x=>x};
    const status=[];
    const au=wardrobe.iniciar({UE:aUE,puerts:ap,ler:()=>null,escolher(){},opcoes:()=>[],estadoUI:s=>status.push(s),
        nativos:()=>({mixin:nativeMixin,entrada:input}),apresentacao:{}});
    const unregisterReal=compat.registerAtelier({suspendMenu:v=>au.suspenderMenu(v),nativeInputRefreshed:v=>au.entradaNativaAtualizada(v)});
    au.atualizar(game);
    check("Atelier listens only to its visible native outfit grid",group.OnButtonBaseClicked.fns.size===1&&au.paginaAtiva()===av);
    check("Atelier confirm binding is recursion-safe",calls.bind===1);
    const oldRefresh=av.refreshReplaceOutfitInputBar;
    const atToken=compat.reserveStudioMenu(av,C.TAB);
    check("Atelier immediately disconnects its observers on Studio reservation",group.OnButtonBaseClicked.fns.size===0&&au.paginaAtiva()===null);
    au.atualizar(game);
    check("Atelier polling cannot reattach while Studio owns the view",group.OnButtonBaseClicked.fns.size===0&&av.refreshReplaceOutfitInputBar===oldRefresh);
    av.confirmOutfit(card.AccessoryOutFitID);
    check("Stale native confirm cannot equip an outfit during Studio",calls.confirm===0);
    av.BackInput();
    check("Back still delegates to the native menu during Studio",calls.back===1);
    compat.releaseStudioMenu(atToken);au.atualizar(game);
    check("Returning to Outfit restores Atelier observation",group.OnButtonBaseClicked.fns.size===1&&au.paginaAtiva()===av);
    au.parar();unregisterReal();
    check("Atelier cleanup disconnects its observer",group.OnButtonBaseClicked.fns.size===0);
    return checks;
}
module.exports=runMenuTests;
