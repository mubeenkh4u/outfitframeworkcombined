"use strict";

const roupas = require("./roupas");
const compat = require("PBZModsMenu/Mods/PBZSoulHairStudioMenu/combined-compat");
const cartao = "pbz_outfit_acateliesoul";
const chapeus = [
    { id: "Fengxue", nome: "Vento e Neve", detalhe: "Fengxue", linha: "Hat_Fengxue" },
    { id: "Changhong", nome: "Velho Amigo", detalhe: "Changhong", linha: "Hat_GuYou" },
    { id: "Bambu", nome: "Chapéu de bambu", linha: "Hat_Default" },
    { id: "BambuGasto", nome: "Chapéu de bambu gasto", linha: "Hat_Default_Climax" },
    { id: "Legacy", nome: "Chapéu do Legado", detalhe: "Mo Tian", linha: "Hat_MoTian" },
    { id: "Zhuiming", nome: "Capuz de Zhuiming", linha: "Hat_ZhuiMing" },
    { id: "Sem", nome: "Sem chapéu" }
];
exports.chapeus = chapeus;
const igual = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const lerMalha = c => c.GetSkeletalMeshAsset();
const lerPano = c => c.GetClothAsset();
const modelosChapeu = {
    Hat_Fengxue: "Hun_Hat_FengXue", Hat_GuYou: "Hun_Hat_ChangHong", Hat_Default: "Hun_Hat_00",
    Hat_Default_Climax: "Hun_Hat_01", Hat_MoTian: "Hun_Hat_MoTian", Hat_ZhuiMing: "Hun_Hat_Hook"
};
const malhaChanghong = "/huashira/characters/hero/hero_hun/hats/hun_hat_changhong.hun_hat_changhong";
const peloChanghong = "/Game/PBZContent/Characters/EliteBoss/ChangHong/Material/MI_EliteBoss_ChangHong_HatFur.MI_EliteBoss_ChangHong_HatFur";

exports.criar = function criar(UE, valido, avisar, agora = Date.now) {
    const ativos = new Map(), catalogo = new Map();
    const k = UE.KismetSystemLibrary;
    const caminho = obj => valido(obj) ? String(k.GetPathName(obj)).toLowerCase() : "";
    function recurso(id, corpo) {
        let mem = catalogo.get(id);
        if (mem && mem.assets.every(valido)) return mem;
        const linha = UE.PBZAppearanceComponent.GetAppearanceStruct(id);
        if (!corpo && (!linha || !linha.ItemId || igual(linha.ItemId, "None")) &&
            (!linha || linha.AppearanceType === UE.EAppearanceType.Body)) {
            const nome = modelosChapeu[id];
            if (!nome) return null;
            const path = "/HuaShira/Characters/Hero/Hero_Hun/Hats/" + nome + "." + nome;
            const malha = UE.Object.Load(path);
            if (!valido(malha) || caminho(malha) !== path.toLowerCase() || !malha.IsA(UE.SkeletalMesh.StaticClass())) return null;
            mem = { malha, assets: [malha], encaixe: id === "Hat_GuYou" || id === "Hat_ZhuiMing" ? "Hun Hat01" : "Hun Hat" };
            catalogo.set(id, mem);
            return mem;
        }
        if (!linha || linha.AppearanceType !== (corpo ? UE.EAppearanceType.Body : UE.EAppearanceType.Hat)) return null;
        const assets = [];
        function carregar(ref) {
            if (!ref || !k.IsValidSoftObjectReference(ref)) return null;
            const obj = k.LoadAsset_Blocking(ref);
            if (!valido(obj)) throw new Error("Recurso indisponível em " + id);
            assets.push(obj);
            return obj;
        }
        const malha = carregar(corpo ? linha.BodyMeshAsset : linha.HatAsset);
        if (!valido(malha) || !malha.IsA(UE.SkeletalMesh.StaticClass())) return null;
        const malhas = new Set([caminho(malha)]), panos = new Set();
        if (corpo) {
            const secundaria = carregar(linha.ClothMeshAsset);
            if (secundaria) malhas.add(caminho(secundaria));
            const lista = linha.BodyClothDataArray;
            for (let i = 0; lista && i < lista.Num(); i++) {
                const pano = carregar(lista.Get(i).ClothAsset);
                if (pano) panos.add(caminho(pano));
            }
        }
        mem = { id, assets, malha, malhas, panos, encaixe: linha.bHatUseSkinComponent ? "Hun Hat01" : "Hun Hat" };
        catalogo.set(id, mem);
        return mem;
    }
    function registro(comp) {
        if (!ativos.has(comp)) ativos.set(comp, {});
        return ativos.get(comp);
    }
    function visivel(c, ator) {
        return valido(c) && c.GetOwner() === ator && c.IsVisible() && !c.bHiddenInGame;
    }
    function listar(ator, comp, dados) {
        const vistos = new Map(), panos = new Set(), malhas = new Set();
        for (const [tipo, ler, esperados, encontrados] of [
            [UE.SkeletalMeshComponent, lerMalha, dados.malhas, malhas], [UE.ChaosClothComponent, lerPano, dados.panos, panos]
        ]) {
            const lista = ator.K2_GetComponentsByClass(tipo.StaticClass());
            for (let i = 0; i < lista.Num(); i++) {
                const c = lista.Get(i);
                if (!valido(c) || c.GetOwner() !== ator || vistos.has(c)) continue;
                const path = caminho(ler(c));
                if (!esperados.has(path)) continue;
                encontrados.add(path);
                if (visivel(c, ator)) vistos.set(c, ler);
            }
        }
        return { componentes: vistos, panos: panos.size, malhas: malhas.size, corpoConfirmado: lerMalha(comp.BodyComponent) === dados.malha };
    }
    function vestir(ator, comp, escolha) {
        if (!valido(comp.BodyComponent) || comp.BodyComponent.GetOwner() !== ator ||
            !valido(lerMalha(comp.BodyComponent))) {
            return { componentes: new Map(), estado: "aguardando_encaixe_corporal", panos: 0, malhas: 0 };
        }
        const dados = recurso(roupas.linhas[escolha], true);
        if (!dados) throw new Error("Linha de corpo indisponível para " + escolha);
        const r = registro(comp), primeira = r.escolha !== escolha;
        let visual = listar(ator, comp, dados);
        if (primeira) {
            r.escolha = escolha;
            r.tentativas = 0;
            r.pronto = false;
            r.proxima = 0;
        }
        const completo = () => visual.corpoConfirmado && visual.panos === dados.panos.size;
        const refeito = r.pronto && !completo();
        if (refeito) { r.tentativas = 0; r.proxima = agora() + 1400; r.pronto = false; }
        // Default e Sanguine compartilham a malha corporal, mas têm linhas e tecidos distintos.
        // ReplaceBody usa o mesmo modo visual que o Studio emprega em ReplaceHairStyle.
        const corpoNativo = visual.corpoConfirmado && igual(comp.EquipBodyItem, dados.id);
        if ((primeira || (!completo() && !corpoNativo)) && agora() >= r.proxima && r.tentativas < 3 &&
            !(primeira && escolha === "Changhong" && completo())) {
            r.proxima = agora() + 2500;
            r.tentativas++;
            comp.ReplaceBody(dados.id, true, false);
            compat.notifyBodyChanged(comp);
            visual = listar(ator, comp, dados);
        }
        r.pronto = completo();
        return { ...visual, estado: r.pronto ? "nativo" : "aguardando_roupa", panosEsperados: dados.panos.size };
    }
    function encaixe(comp, nome) {
        const slot = comp[nome];
        return valido(slot) && slot.GetOwner() === comp.GetOwner() &&
            slot.IsA(UE.SkeletalMeshComponent.StaticClass()) ? slot : null;
    }
    function definir(comp, slot, malha) {
        if (!slot || (lerMalha(slot) || null) === malha) return;
        if (malha) comp.SetMeshAsset(malha, slot);
        else slot.SetSkeletalMeshAsset(null);
        if ((lerMalha(slot) || null) !== malha) throw new Error("O jogo ainda não aplicou o chapéu escolhido.");
    }
    function mostrarEncaixe(comp, slot) {
        if (!slot || comp.bAppliedHatVisible !== true || (!slot.bHiddenInGame && slot.IsVisible())) return;
        comp.ApplyHatVisibilityVisual(true);
        if (slot.bHiddenInGame) slot.SetHiddenInGame(false, false);
        if (!slot.IsVisible()) slot.SetVisibility(true, false);
    }
    function soltarPelo(r) {
        const p = r.pelo;
        if (!p) return;
        r.pelo = null;
        if (!valido(p.slot)) return;
        const mesmoChapeu = caminho(lerMalha(p.slot)) === malhaChanghong;
        for (const [i, anterior] of p.antes) {
            if (i < p.slot.GetNumMaterials() && p.slot.GetMaterial(i) === p.material) p.slot.SetMaterial(i, mesmoChapeu ? anterior : null);
        }
    }
    function conferirPelo(r, slot) {
        if (caminho(lerMalha(slot)) !== malhaChanghong) return;
        for (let i = 0; i < slot.GetNumMaterials(); i++) {
            const atual = slot.GetMaterial(i);
            if (valido(atual) && !/^\/engine\/enginematerials\/(worldgridmaterial|defaultmaterial)\./.test(caminho(atual))) continue;
            if (!r.pelo) {
                const material = UE.Object.Load(peloChanghong);
                if (!valido(material) || caminho(material) !== peloChanghong.toLowerCase()) return;
                r.pelo = { slot, material, antes: new Map() };
            }
            const acima = slot.OverrideMaterials;
            const anterior = acima && i < acima.Num() ? acima.Get(i) : null;
            r.pelo.antes.set(i, valido(anterior) ? anterior : null);
            slot.SetMaterial(i, r.pelo.material);
        }
    }
    function chapelar(ator, comp, escolha) {
        const opcao = chapeus.find(c => c.id === escolha);
        if (!opcao) return { estado: "sem_modelo" };
        const dados = opcao.linha ? recurso(opcao.linha, false) : null;
        if (opcao.linha && !dados) throw new Error("Linha de chapéu indisponível para " + opcao.nome);
        const rigido = encaixe(comp, "Hun Hat"), pele = encaixe(comp, "Hun Hat01");
        const destino = dados?.encaixe === "Hun Hat01" ? pele : rigido, outro = destino === pele ? rigido : pele;
        if (!rigido && !pele || dados && !destino) return { estado: "aguardando_encaixe" };
        const r = registro(comp);
        if (r.pelo && (escolha !== "Changhong" || r.pelo.slot !== destino || !valido(destino) ||
            caminho(lerMalha(destino)) !== malhaChanghong)) soltarPelo(r);
        const rig = rigido && lerMalha(rigido) || null, skin = pele && lerMalha(pele) || null;
        const base = recurso("Hat_Fengxue", false);
        const permitido = (atual, slot) => !atual || atual === dados?.malha ||
            (slot === rigido && atual === base?.malha) || atual === r.chapeu?.malha;
        if (!permitido(rig, rigido) || !permitido(skin, pele)) return { estado: "encaixe_de_outro_mod" };
        r.chapeu = dados || { malha: null };
        const trocouEncaixe = dados && destino && lerMalha(destino) !== dados.malha;
        definir(comp, outro, null);
        definir(comp, destino, dados?.malha || null);
        if (!dados) return { estado: "sem_chapeu" };
        if (trocouEncaixe) mostrarEncaixe(comp, destino);
        if (escolha === "Changhong") conferirPelo(r, destino);
        if (!visivel(destino, ator) || comp.bAppliedHatVisible === false) return { estado: "oculto_no_jogo" };
        return { estado: "nativo", componente: destino, lerAsset: lerMalha };
    }
    function restaurarChapeu(comp, r, chapeuDestino) {
        if (r.chapeu) {
            try {
                const rigido = encaixe(comp, "Hun Hat"), pele = encaixe(comp, "Hun Hat01");
                const sem = igual(chapeuDestino, "None"), base = sem ? null : recurso(chapeuDestino, false);
                const proprio = slot => !slot || !lerMalha(slot) || lerMalha(slot) === r.chapeu.malha;
                if ((sem || base) && proprio(rigido) && proprio(pele)) {
                    const slot = base?.encaixe === "Hun Hat01" ? pele : rigido;
                    definir(comp, slot === pele ? rigido : pele, null);
                    definir(comp, slot, base?.malha || null);
                    if (base) mostrarEncaixe(comp, slot);
                }
            } catch (erro) { avisar("Restauração do chapéu: " + erro); }
        }
        r.chapeu = undefined;
    }
    function cederChapeu(comp) {
        const r = ativos.get(comp);
        if (!r?.chapeu || !valido(comp)) return;
        soltarPelo(r);
        restaurarChapeu(comp, r, "Hat_Fengxue");
    }
    function esquecer(comp, roupaExibida) {
        const r = ativos.get(comp);
        ativos.delete(comp);
        if (!r || !valido(comp)) return;
        soltarPelo(r);
        // A forced-default cinematic is controlled by the game, not the wardrobe.
        if (typeof comp.ShouldForceDefaultAppearance === "function" && comp.ShouldForceDefaultAppearance()) return;
        const efetiva = roupaExibida || comp.GetEffectiveOutfit();
        let corpoDestino = roupas.linhas.Changhong, chapeuDestino = "Hat_Fengxue";
        if (!igual(efetiva, cartao)) {
            if (!efetiva || igual(efetiva, "None")) return;
            const linha = UE.PBZAppearanceComponent.GetAppearanceStruct(efetiva);
            if (linha?.AppearanceType !== UE.EAppearanceType.Outfit || !linha.OutfitBodyItem || igual(linha.OutfitBodyItem, "None")) return;
            corpoDestino = String(linha.OutfitBodyItem);
            chapeuDestino = String(linha.OutfitHatItem || "None");
        }
        if (!compat.studioHasHat(comp)) restaurarChapeu(comp, r, chapeuDestino);
        if (r.escolha && !igual(roupas.linhas[r.escolha], corpoDestino)) {
            const atual = catalogo.get(roupas.linhas[r.escolha]);
            const jaEquipouOutra = comp.EquipBodyItem && !igual(comp.EquipBodyItem, "None") &&
                !igual(comp.EquipBodyItem, roupas.linhas[r.escolha]) && !igual(comp.EquipBodyItem, roupas.linhas.Changhong);
            if (!jaEquipouOutra && atual && valido(comp.BodyComponent) && atual.malhas.has(caminho(lerMalha(comp.BodyComponent)))) {
                comp.ReplaceBody(corpoDestino, true, false);
                compat.notifyBodyChanged(comp);
            }
        }
    }
    return { vestir, chapelar, cederChapeu, temChapeu: comp => !!ativos.get(comp)?.chapeu, fim(vistos, destinos = new Map()) {
        for (const comp of ativos.keys()) if (!vistos.has(comp)) {
            try { esquecer(comp, destinos.get(comp)); } catch (erro) { avisar("Restauração do traje: " + erro); }
        }
    }, parar() {
        for (const comp of ativos.keys()) {
            try { esquecer(comp); } catch (erro) { avisar("Restauração do traje: " + erro); }
        }
        catalogo.clear();
    } };
};
