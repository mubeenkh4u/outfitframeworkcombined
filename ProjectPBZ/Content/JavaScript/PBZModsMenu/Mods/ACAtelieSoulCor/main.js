"use strict";
// Keep one active Atelier controller per Mods Menu VM, including reloads.
const previousInstance = globalThis.__PBZCombinedAtelierInstance;
if (previousInstance?.active) {
    module.exports = previousInstance.exports;
} else {
const UE = require("ue"), puerts = require("puerts");
const roupas = require("./roupas"), vestuario = require("./vestuario"), cores = require("./cores");
const compat = require("PBZModsMenu/Mods/PBZSoulHairStudioMenu/combined-compat");
const roupa = "PBZ_OutFit_ACAtelieSoul";
const cena = "/HuaShira/Animation/Seqs/ActorForSeqs/BP_Seq_Hun.BP_Seq_Hun_C";
const padroes = { conjunto: "Changhong", chapeu: "Fengxue", corRoupa: "Original", corChapeu: "Original", controladorChapeu: "Atelie" };
let ativo = true, ocupado = false, pendente = false;
const avisos = new Set();
function avisar(msg) {
    if (avisos.has(msg)) return;
    avisos.add(msg);
    console.warn("[ACAtelieSoulCor] " + msg);
    if (typeof globalThis.PBZModsMenu?.toast === "function") globalThis.PBZModsMenu.toast(msg);
}
function valido(obj) {
    if (!obj) return false;
    try { return UE.KismetSystemLibrary.IsValid(obj); }
    catch (erro) { if (/invalid object|object is invalid/i.test(String(erro))) return false; throw erro; }
}
function aparenciaForcada(comp) {
    return typeof comp.ShouldForceDefaultAppearance === "function" && comp.ShouldForceDefaultAppearance();
}
function tentar(nome, acao) {
    try { return acao(); } catch (erro) { avisar(nome + ": " + erro); }
}
const prefs = require("./preferencias").criar(UE, puerts, padroes, avisar);
const registro = require("./registro").criar(UE, valido);
const armario = vestuario.criar(UE, valido, avisar);
const tintas = cores.criar(UE, valido, avisar);
function opcoes() {
    const v = prefs.valores;
    return [
        { chave: "conjunto", rotulo: "Roupa completa", itens: roupas.opcoes },
        { chave: "chapeu", rotulo: "Chapéu", itens: vestuario.chapeus,
            descricao: "Escolher um chapéu devolve o controle ao Ateliê." },
        { chave: "controladorChapeu", rotulo: "Controle do chapéu", itens: [
            { id: "Atelie", nome: "Ateliê do Soul", detalhe: "Usa o chapéu e a cor escolhidos aqui." },
            { id: "Studio", nome: "Appearance Studio", detalhe: "Usa a seleção da aba Máscaras do Studio." }
        ] },
        { chave: "corRoupa", rotulo: "Cor da roupa", itens: cores.opcoesRoupa(v.conjunto) },
        { chave: "corChapeu", rotulo: "Cor do chapéu", itens: cores.opcoesChapeu(v.chapeu),
            descricao: v.chapeu === "Sem" ? "Escolha um chapéu para aplicar uma cor." :
                v.controladorChapeu === "Studio" ? "Escolher uma cor devolve o controle do chapéu ao Ateliê." : undefined }
    ];
}
function ler(chave) {
    const grupo = opcoes().find(g => g.chave === chave);
    return grupo?.itens.some(x => x.id === prefs.valores[chave]) ? prefs.valores[chave] : padroes[chave];
}
function escolher(chave, id) {
    const grupo = opcoes().find(g => g.chave === chave);
    if (!ativo || !grupo?.itens.some(x => x.id === id)) return;
    const recuperarChapeu = (chave === "chapeu" || chave === "corChapeu") && ler("controladorChapeu") !== "Atelie";
    if (ler(chave) === id && !recuperarChapeu) return;
    prefs.valores[chave] = id;
    if (recuperarChapeu) prefs.valores.controladorChapeu = "Atelie";
    registro.escolha();
    prefs.salvar();
    // A atualização periódica aplica a escolha nos atores após o despacho do evento da interface.
}
const ui = require("./guarda_roupa").iniciar({ UE, puerts, ler, escolher, opcoes, estadoUI: registro.interfaceAtual });
function reunir(game, transicoes, destinos) {
    const atores = new Map();
    function incluir(ator, origem) {
        if (!valido(ator) || atores.has(ator)) return;
        const comp = ator.GetComponentByClass(UE.PBZAppearanceComponent.StaticClass());
        if (valido(comp) && comp.GetOwner() === ator && !aparenciaForcada(comp) && compat.isAtelier(comp.GetEffectiveOutfit())) atores.set(ator, { comp, origem });
    }
    incluir(UE.GameplayStatics.GetPlayerPawn(game, 0), "jogador");
    const seq = UE.Object.Find(cena);
    if (valido(seq)) {
        const ref = puerts.$ref();
        UE.GameplayStatics.GetAllActorsOfClass(game, seq, ref);
        const lista = puerts.$unref(ref);
        for (let i = 0; i < lista.Num(); i++) incluir(lista.Get(i), "cena");
    }
    const tela = ui.paginaAtiva() || compat.studioPreviewPage();
    if (!valido(tela) || typeof tela.getDisplayedPreviewOutfitID !== "function" ||
        typeof tela.getPreviewDollComponent !== "function" || typeof tela.getPreviewGameMode !== "function") return atores;
    const comp = tela.getPreviewDollComponent(), modo = tela.getPreviewGameMode();
    if (!valido(comp) || !valido(modo) || typeof modo.getActivePreviewDoll !== "function") return atores;
    const ator = comp.GetOwner();
    if (valido(ator) && modo.getActivePreviewDoll() === ator) {
        const emTransicao = tela.previewPhase != null && tela.previewPhase !== 0;
        const exibido = String(tela.getDisplayedPreviewOutfitID());
        if (!emTransicao && !ator.bHidden && !aparenciaForcada(comp) && compat.isAtelier(exibido)) {
            atores.set(ator, { comp, origem: "previa" });
        } else {
            atores.delete(ator);
            if (emTransicao) transicoes.add(comp);
            else if (exibido && exibido.toLowerCase() !== "none") destinos.set(comp, exibido);
        }
    }
    return atores;
}
function registrarRecusas(lista, componente) {
    if (lista.length >= 8) return;
    for (const item of tintas.detalhes(componente)) {
        if (lista.some(x => x.material === item.material && x.motivo === item.motivo)) continue;
        lista.push({ material: item.material, motivo: item.motivo });
        if (lista.length === 8) break;
    }
}
function vestir(ator, comp, origem, selecao) {
    const previa = origem === "previa";
    const visual = tentar("Roupa", () => armario.vestir(ator, comp, selecao.conjunto));
    let hat;
    if (compat.atelierOwnsHat(roupa, comp)) {
        hat = tentar("Chapéu", () => {
            // Transfer ownership before touching either shared native hat slot.
            compat.releaseStudioHat(comp, roupa);
            return armario.chapelar(ator, comp, selecao.chapeu);
        });
    } else {
        tentar("Ceder chapéu ao Studio", () => compat.releaseAtelierHat(comp, roupa));
        hat = { estado: "controle_do_studio" };
    }
    let slotsRoupa = 0, slotsChapeu = 0;
    const recusasRoupa = [], recusasChapeu = [];
    if (visual && selecao.corRoupa !== "Original") {
        for (const [c, lerAsset] of visual.componentes) {
            slotsRoupa += tentar("Tingimento da roupa", () => tintas.roupa(c, lerAsset, selecao.conjunto, previa)) || 0;
            if (origem !== "cena") registrarRecusas(recusasRoupa, c);
        }
    }
    if (hat?.componente && selecao.corChapeu !== "Original") {
        slotsChapeu = tentar("Tingimento do chapéu", () => tintas.chapeu(hat.componente, hat.lerAsset, selecao.chapeu, previa)) || 0;
        if (origem !== "cena") registrarRecusas(recusasChapeu, hat.componente);
    }
    const quadro = { ...selecao, roupa: visual?.estado || "erro", chapeuAplicado: hat?.estado || "erro",
        malhas: visual?.malhas || 0, panos: visual?.panos || 0, panosEsperados: visual?.panosEsperados, slotsRoupa, slotsChapeu };
    if (recusasRoupa.length) quadro.recusasRoupa = recusasRoupa;
    if (recusasChapeu.length) quadro.recusasChapeu = recusasChapeu;
    if (origem !== "cena" && selecao.corRoupa !== "Original" && !slotsRoupa &&
        visual?.estado === "nativo" && visual.componentes.size > 0) {
        const nome = roupas.opcoes.find(i => i.id === selecao.conjunto)?.nome || selecao.conjunto;
        avisar("Nenhum material visível da roupa " + nome + " aceitou a cor nesta visualização.");
    }
    if (origem !== "cena" && selecao.corChapeu !== "Original" && !slotsChapeu &&
        hat?.estado === "nativo" && hat.componente) {
        const nome = vestuario.chapeus.find(i => i.id === selecao.chapeu)?.nome || selecao.chapeu;
        avisar("Nenhum material visível do chapéu " + nome + " aceitou a cor nesta visualização.");
    }
    registro.visual(origem, quadro);
}
function atualizar() {
    if (!ativo) return;
    if (ocupado) { pendente = true; return; }
    ocupado = true;
    const vistos = new Set(), destinos = new Map();
    try {
        prefs.abrir();
        for (const chave of ["conjunto", "chapeu"]) prefs.valores[chave] = ler(chave);
        const selecao = Object.fromEntries(Object.keys(padroes).map(chave => [chave, ler(chave)]));
        const game = puerts.argv.getByName("GameInstance");
        tentar("Registro da roupa", () => registro.consultar(game));
        tintas.inicio(selecao.corRoupa, selecao.corChapeu);
        tentar("Guarda-roupa", () => ui.atualizar(valido(game) ? game : null));
        if (valido(game)) for (const [ator, {comp, origem}] of reunir(game, vistos, destinos)) {
            vistos.add(comp);
            tentar("Aparência", () => vestir(ator, comp, origem, selecao));
        }
    } catch (erro) { avisar("Falha ao conferir o Ateliê: " + erro); }
    finally {
        tentar("Restaurar materiais", () => tintas.fim());
        tentar("Encerrar personalização anterior", () => armario.fim(vistos, destinos));
        tentar("Registro da sessão", () => registro.gravar());
        ocupado = false;
    }
    if (pendente) { pendente = false; atualizar(); }
}
function trocarControlador(id) {
    if (!ativo) return false;
    prefs.abrir();
    if (ler("controladorChapeu") === id) return false;
    escolher("controladorChapeu", id);
    return true;
}
const unregisterCompat = compat.registerAtelier({
    controller() { prefs.abrir(); return prefs.valores.controladorChapeu === "Studio" ? "Studio" : "Atelie"; },
    hatRow() {
        prefs.abrir();
        const item = vestuario.chapeus.find(x => x.id === prefs.valores.chapeu) || vestuario.chapeus.find(x => x.id === padroes.chapeu);
        return item?.linha || "None";
    },
    claimStudioHat: () => trocarControlador("Studio"),
    claimAtelierHat: () => trocarControlador("Atelie"),
    suspendMenu: view => ui.suspenderMenu(view),
    nativeInputRefreshed: view => ui.entradaNativaAtualizada(view),
    releaseHat(comp) {
        // Release the dye MID before releasing the mesh and fur material.
        if (!armario.temChapeu(comp)) return;
        tintas.liberarChapeu(comp);
        armario.cederChapeu(comp);
    }
});
const instance = { active: true, exports };
globalThis.__PBZCombinedAtelierInstance = instance;
const timer = setInterval(atualizar, 330);
atualizar();
exports.ready = true;
exports.stop = function parar() {
    if (!ativo) return;
    ativo = false;
    clearInterval(timer);
    tentar("Fechar guarda-roupa", () => ui.parar());
    tentar("Restaurar cores", () => tintas.parar());
    tentar("Restaurar vestuário", () => armario.parar());
    unregisterCompat();
    exports.ready = false;
    instance.active = false;
    if (globalThis.__PBZCombinedAtelierInstance === instance) delete globalThis.__PBZCombinedAtelierInstance;
};
}
