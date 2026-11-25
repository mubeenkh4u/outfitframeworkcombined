"use strict";

const id = "PBZ_OutFit_ACAtelieSoul";
const globalNome = "/Game/PBZContent/DataTable/UI/DT_PBZAppearanceTable.DT_PBZAppearanceTable";
const igual = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const buscaNome = '(Namespace="Default",Key="' + id + '_Name",';
const puerts = require("puerts");
function contem(lista, nome) {
    for (let i = 0; i < lista.Num(); i++) if (igual(lista.Get(i), nome)) return true;
    return false;
}

function confirmarEstrutura(UE) {
    try {
        const linha = UE.PBZAppearanceComponent.GetAppearanceStruct(id);
        return !!linha && igual(linha.ItemId, id) && String(linha.AppearanceName?.Key) === id + "_Name" &&
            igual(linha.OutfitBodyItem, "HunBodyGuYou") && igual(linha.OutfitHatItem, "Hat_Fengxue") &&
            linha.AppearanceType === UE.EAppearanceType.Outfit && linha.bObtainableInGame === true;
    } catch (_) { return false; }
}

function confirmarLinha(UE, tabela, possui) {
    const direta = confirmarEstrutura(UE);
    if (direta && possui) return true;
    const api = UE.DataTableFunctionLibrary;
    if (typeof api.GetDataTableRowNames !== "function" || typeof api.GetDataTableColumnAsString !== "function") return direta;
    // Antes de uma nova concessão, confira também a tabela quando ela estiver acessível.
    // Uma estrutura ainda em cache pode apontar para o catálogo anterior.
    const saida = puerts.$ref();
    api.GetDataTableRowNames(tabela, saida);
    const nomes = puerts.$unref(saida);
    const total = nomes.Num();
    for (let i = 0; i < total; i++) {
        if (!igual(nomes.Get(i), id)) continue;
        // As APIs da UE percorrem o mesmo RowMap. Leia as colunas do mesmo índice
        // na tabela ativa, inclusive quando outro mod fornece um catálogo composto.
        const campo = nome => {
            const valores = api.GetDataTableColumnAsString(tabela, nome);
            return valores.Num() === total ? String(valores.Get(i)) : "";
        };
        return igual(campo("ItemId"), id) && campo("AppearanceName").startsWith(buscaNome) &&
            igual(campo("OutfitBodyItem"), "HunBodyGuYou") && igual(campo("OutfitHatItem"), "Hat_Fengxue") &&
            igual(campo("AppearanceType"), "Outfit") && igual(campo("bObtainableInGame"), "True");
    }
    return false;
}

exports.criar = function (UE, valido, agora = Date.now) {
    let anterior, tabela, proximaConsulta = 0, novaTentativa = 0, tentativas = 0;
    let identidadeConfirmada = false, proximaConferencia = 0, posseAnterior = false;
    let ultimaGravacao = null, proximaGravacao = 0;
    const dados = { versao: "0.4.3", linha: "aguardando_jogador", conta: "aguardando",
        catalogo: "aguardando", interface: "pagina_fechada", cartaoObservado: false,
        controlesMontados: false, escolhaRecebida: false };
    function interfaceAtual(estado, previa) {
        dados.interface = estado;
        if (previa) dados.ultimaPreviaMenu = previa;
        const aberta = estado === "aba_categorias" || estado === "aba_opcoes" || estado === "controles_montados";
        if (estado.startsWith("cartao_") || aberta) dados.cartaoObservado = true;
        if (aberta) dados.controlesMontados = true;
    }
    function gravar() {
        const texto = Object.entries(dados).map(([k, v]) => k + "=" + v).join("\n") + "\n";
        if (texto === ultimaGravacao || agora() < proximaGravacao) return;
        try {
            const k = UE.KismetSystemLibrary;
            const pasta = k.ConvertToAbsolutePath(k.GetProjectSavedDirectory()).replace(/[\\/]+$/, "");
            if (!pasta || !UE.EasyCsv.SaveStringToFileWithFullPath(texto, pasta + "/ACAtelieSoul-status.txt")) throw new Error();
            ultimaGravacao = texto;
        } catch (_) { proximaGravacao = agora() + 5000; }
    }
    function consultar(game) {
        if (agora() < proximaConsulta) return;
        proximaConsulta = agora() + 1400;
        if (!valido(game)) return;
        const controle = UE.GameplayStatics.GetPlayerController(game, 0);
        const pawn = UE.GameplayStatics.GetPlayerPawn(game, 0);
        if (!valido(controle) || !valido(pawn) || !controle.IsLocalPlayerController()) return;
        const controlado = typeof controle.K2_GetPawn === "function" ? controle.K2_GetPawn() : controle.Pawn;
        if (controlado !== pawn) return;
        const comp = pawn.GetComponentByClass(UE.PBZAppearanceComponent.StaticClass());
        if (!valido(comp) || comp.GetOwner() !== pawn || !comp.IsAppearanceLogicEnabled()) return;
        if (anterior !== comp) {
            anterior = comp; novaTentativa = 0; tentativas = 0; tabela = undefined;
        }
        dados.conta = "aguardando_linha"; dados.catalogo = "aguardando";
        if (!valido(tabela)) {
            identidadeConfirmada = false; proximaConferencia = 0;
            tabela = UE.Object.Load(globalNome);
        }
        if (!valido(tabela)) { dados.linha = "tabela_global_indisponivel"; return; }
        const existe = UE.DataTableFunctionLibrary.DoesDataTableRowExist(tabela, id);
        if (!existe) {
            identidadeConfirmada = false; proximaConferencia = 0;
            dados.linha = "ausente_na_tabela_ativa"; return;
        }
        const possui = comp.IsOutfitOwned(id);
        if (posseAnterior && !possui) {
            identidadeConfirmada = false; proximaConferencia = 0;
            tentativas = 0; novaTentativa = 0;
        }
        posseAnterior = possui;
        if (!identidadeConfirmada && agora() >= proximaConferencia) {
            proximaConferencia = agora() + 10000;
            try { identidadeConfirmada = confirmarLinha(UE, tabela, possui); }
            catch (_) { identidadeConfirmada = false; }
        }
        dados.linha = identidadeConfirmada ? "confirmada" : "aparencia_ainda_nao_resolvida";
        if (comp.IsDebugObtainableOutfitsLocked() || comp.IsDebugAllOutfitsUnlocked()) {
            dados.conta = "controle_de_teste_do_jogo_ativo"; return;
        }
        if (!possui) {
            if (!identidadeConfirmada) return;
            if (!contem(comp.GetLockedOutfits(), id)) {
                dados.conta = "aguardando_catalogo_nativo"; return;
            }
            dados.conta = "bloqueada";
            if (agora() >= novaTentativa && tentativas < 3) {
                tentativas++;
                novaTentativa = agora() + 10000;
                // Somente a nossa linha, depois de confirmada na lista de roupas obteníveis.
                comp.UnlockOutfit(id);
            }
            if (!comp.IsOutfitOwned(id)) return;
        }
        dados.conta = "propriedade_confirmada";
        dados.catalogo = contem(comp.GetOwnedOutfits(), id) ? "presente_na_lista" : "ausente_na_lista";
        proximaConsulta = agora() + 4000;
    }
    return {
        consultar(game) {
            try { consultar(game); }
            catch (erro) {
                dados.conta = "erro_de_consulta"; throw erro;
            }
        },
        interfaceAtual, escolha() { dados.escolhaRecebida = true; },
        visual(origem, quadro) {
            if (origem === "jogador") dados.ultimaAplicacaoJogador = JSON.stringify(quadro);
            if (origem === "previa") dados.ultimaAplicacaoPrevia = JSON.stringify(quadro);
        },
        gravar
    };
};
