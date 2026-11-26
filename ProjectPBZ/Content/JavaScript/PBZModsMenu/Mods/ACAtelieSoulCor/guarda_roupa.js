"use strict";

const roupa = "PBZ_OutFit_ACAtelieSoul";
const compat = require("PBZModsMenu/Mods/PBZSoulHairStudioMenu/combined-compat");
const classePagina = "/Game/PBZContent/UI/UINew/System/Character/W_Appearance_V2.W_Appearance_V2_C";
const classePersonagem = "/Game/PBZContent/UI/UINew/System/Character/WB_CharacterV5.WB_CharacterV5_C";
const secoes = [
    ["Vestuário", ["conjunto", "chapeu", "controladorChapeu"]],
    ["Cores", ["corRoupa", "corChapeu"]]
];
const nossa = id => String(id).toLowerCase() === roupa.toLowerCase();
const carregarNativos = () => ({
    mixin: require("UI/Widget/Appearance").AppearanceMixinInterface.prototype,
    entrada: require("Library/UIHelper").default
});

exports.iniciar = function iniciar({ UE, puerts, ler, escolher, opcoes, estadoUI, nativos = carregarNativos,
    agora = Date.now, apresentacao = require("./painel"), agendar = setTimeout, cancelar = clearTimeout }) {
    let jogo, observado, edicao, entrada, encerrado = false;
    let hooks, ultimaEntrada, equipando, ultimaPagina, visita;
    const avisos = new Set();

    function avisar(erro) {
        const texto = String(erro);
        if (!avisos.has(texto)) { avisos.add(texto); console.warn("[ACAtelieSoulCor] Guarda-roupa: " + texto); }
    }

    function informar(codigo) {
        if (estadoUI) estadoUI(codigo, visita?.diagnostico);
    }

    function valido(obj) {
        if (!obj) return false;
        try { return UE.KismetSystemLibrary.IsValid(obj); }
        catch (erro) { if (/invalid object|object is invalid/i.test(String(erro))) return false; throw erro; }
    }

    function visivel(widget) {
        const vistos = new Set();
        while (valido(widget)) {
            if (vistos.has(widget) || !widget.IsVisible()) return false;
            vistos.add(widget);
            const pai = widget.GetParent();
            if (valido(pai) && pai.IsA(UE.WidgetSwitcher.StaticClass()) && pai.GetActiveWidget() !== widget) return false;
            widget = pai;
        }
        return true;
    }

    function widgets(classe) {
        const ref = puerts.$ref(UE.NewArray(UE.UserWidget));
        UE.WidgetBlueprintLibrary.GetAllWidgetsOfClass(jogo, ref, classe, false);
        return puerts.$unref(ref);
    }

    function paginaLocal(pagina) {
        if (!valido(jogo) || !valido(pagina) || !visivel(pagina) || pagina.inputBarSuspended === true) return false;
        const controle = UE.GameplayStatics.GetPlayerController(jogo, 0);
        return valido(controle) && pagina.GetOwningPlayer() === controle;
    }

    function donoDaPagina(pagina) {
        const classe = UE.Object.Find(classePersonagem);
        if (!valido(classe)) return null;
        const donos = widgets(classe);
        for (let i = 0; i < donos.Num(); i++) {
            const dono = donos.Get(i);
            if (valido(dono) && dono.W_Appearance_V2 === pagina && valido(dono.TabList)) {
                return dono;
            }
        }
        return null;
    }

    function naAparencia(pagina, dono = donoDaPagina(pagina)) {
        return !compat.studioOwnsMenu(pagina) && (!dono || String(dono.TabList.GetSelectedTabId()).toLowerCase() === "appearance");
    }

    function restaurarSelecao(pagina, id) {
        const grupo = pagina.W_SystemPanel?.ButtonGroup;
        if (!valido(grupo)) return false;
        if (String(grupo.GetSelectedButtonBase()?.AccessoryOutFitID) === id) return true;
        const total = grupo.GetButtonCount();
        for (let i = 0; i < total; i++) {
            if (String(grupo.GetButtonBaseAtIndex(i)?.AccessoryOutFitID) === id) {
                grupo.SelectButtonAtIndex(i, false);
                return true;
            }
        }
        return false;
    }

    function conferirPrevia(pagina, dono) {
        if (!dono || typeof dono.IsVisible !== "function" || !visivel(dono) ||
            dono.GetOwningPlayer() !== pagina.GetOwningPlayer() || !valido(dono.WidgetSwitcher_31) ||
            dono.WidgetSwitcher_31.GetActiveWidgetIndex() !== 1) { visita = null; return; }
        const controlador = pagina.GetOwningPlayer();
        if (!controlador.IsLocalPlayerController()) { visita = null; return; }
        const tempo = agora();
        if (visita?.dono !== dono) visita = { dono, desde: tempo, direta: false, reabriu: false };
        if (visita.selecaoPendente) {
            visita.limiteSelecao ??= tempo + 4000;
            const atual = cartaoAtual(pagina)?.AccessoryOutFitID;
            const mudou = atual && visita.selecaoAoReabrir && String(atual) !== visita.selecaoAoReabrir;
            if (edicao || mudou || tempo > visita.limiteSelecao || restaurarSelecao(pagina, visita.selecaoPendente)) {
                visita.selecaoPendente = null;
            }
        }
        let modo = pagina.getPreviewGameMode?.();
        if (!valido(modo)) modo = UE.GameplayStatics.GetGameMode(controlador);
        const alvo = controlador.GetViewTarget();
        const pawn = UE.GameplayStatics.GetPlayerPawn(jogo, 0);
        const ponto = valido(modo) ? modo.AppearancePreviewPoint : null;
        let estado;
        if (pagina.previewPhase != null && pagina.previewPhase !== 0) estado = "em_transicao";
        else if (!valido(modo) || !valido(alvo) || !valido(pawn)) estado = "aguardando_contexto";
        else if (alvo === ponto) {
            if (typeof modo.getActivePreviewDoll !== "function") estado = "leitura_do_boneco_indisponivel";
            else {
                const boneco = modo.getActivePreviewDoll();
                estado = !valido(boneco) ? "estudio_sem_boneco" : boneco.bHidden ? "boneco_oculto" : "estudio_com_boneco";
            }
        }
        else estado = alvo === pawn ? "camera_no_jogador" : "outra_camera";
        if (visita.estado !== estado) {
            visita.estado = estado; visita.desde = tempo;
            visita.diagnostico = estado;
        }
        if (!naAparencia(pagina, dono) || estado !== "camera_no_jogador" && estado !== "estudio_sem_boneco") return;
        if (visita.reabriu || tempo - visita.desde < (estado === "estudio_sem_boneco" || visita.direta ? 15000 : 3000)) return;

        // O fluxo nativo posiciona a câmera e prepara o boneco. Nunca force visibilidade durante a dissolução.
        if (estado === "camera_no_jogador" && !visita.direta && valido(ponto) &&
            typeof pagina.enterStudio === "function" && pagina.enterStudio.length === 0) {
            visita.direta = true; visita.desde = tempo; visita.diagnostico = "entrada_no_estudio_solicitada";
            pagina.enterStudio();
            return;
        }
        // Only the shared Studio router may re-enter the native view in combined mode.
        // Keep the original fallback for Atelier-only installations.
        if (compat.studioRegistered()) { visita.diagnostico = "aguardando_previa_nativa"; return; }
        // Recriar a lista enquanto se edita descartaria o foco e a navegação.
        if (edicao || !visivel(pagina.W_SystemPanel) || typeof pagina.FinishCurrentWidget !== "function" ||
            typeof dono.onTabSelected !== "function") return;
        const selecionado = cartaoAtual(pagina)?.AccessoryOutFitID;
        visita.reabriu = true; visita.diagnostico = "reabertura_da_aparencia_solicitada";
        pagina.FinishCurrentWidget(false);
        dono.onTabSelected("Appearance");
        const nova = dono.W_Appearance_V2;
        if (selecionado) {
            visita.selecaoPendente = String(selecionado);
            if (valido(nova)) {
                const atual = cartaoAtual(nova)?.AccessoryOutFitID;
                visita.selecaoAoReabrir = atual ? String(atual) : null;
                if (paginaLocal(nova) && naAparencia(nova, dono) && restaurarSelecao(nova, visita.selecaoPendente)) {
                    visita.selecaoPendente = null;
                }
            }
        }
        return true;
    }

    function cartaoAtual(pagina) {
        const grupo = pagina.W_SystemPanel?.ButtonGroup;
        return valido(grupo) ? grupo.GetSelectedButtonBase() : null;
    }

    function podeAbrir(pagina, cartao) {
        return !encerrado && paginaLocal(pagina) && naAparencia(pagina) && valido(cartao) &&
            nossa(cartao.AccessoryOutFitID) && cartao === cartaoAtual(pagina) && visivel(pagina.W_SystemPanel);
    }

    // CommonUI pode entregar a mesma confirmação ao botão com foco e à barra de ações.
    function entradaDuplicada(via) {
        const tempo = agora();
        if (ultimaEntrada && ultimaEntrada.via !== via && tempo - ultimaEntrada.tempo < 80) return true;
        ultimaEntrada = { via, tempo };
        return false;
    }

    function limparLinhas(aba) {
        for (const { botao, clique } of aba.linhas) {
            if (valido(botao)) botao.OnClicked.Remove(clique);
        }
        aba.linhas = [];
        if (valido(aba.lista)) aba.lista.ClearChildren();
    }

    function fechar(foco) {
        const aba = edicao;
        if (!aba) return;
        edicao = undefined;
        if (aba.timerAcao !== undefined) cancelar(aba.timerAcao);
        try {
            if (valido(aba.pagina) && aba.finalizar && aba.pagina.FinishCurrentWidget === aba.finalizar) {
                if (aba.descFinalizar) Object.defineProperty(aba.pagina, "FinishCurrentWidget", aba.descFinalizar);
                else Reflect.deleteProperty(aba.pagina, "FinishCurrentWidget");
            }
        } catch (erro) { avisar(erro); }
        try { limparLinhas(aba); } catch (erro) { avisar(erro); }
        try { if (valido(aba.raiz)) aba.raiz.RemoveFromParent(); } catch (erro) { avisar(erro); }
        for (const [widget, visibilidade] of aba.ocultos) {
            try {
                if (valido(widget) && widget.GetVisibility() === UE.ESlateVisibility.Collapsed) widget.SetVisibility(visibilidade);
            } catch (erro) { avisar(erro); }
        }
        try {
            if (foco && paginaLocal(aba.pagina) && naAparencia(aba.pagina) && cartaoAtual(aba.pagina) === aba.cartao) {
                aba.cartao.SetUserFocus(aba.controle);
                aba.pagina.refreshReplaceOutfitInputBar();
            }
        } catch (erro) { avisar(erro); }
    }

    function aindaEditando(aba) {
        return edicao === aba && paginaLocal(aba.pagina) && naAparencia(aba.pagina) &&
            cartaoAtual(aba.pagina) === aba.cartao && nossa(aba.cartao.AccessoryOutFitID) &&
            valido(aba.raiz) && aba.raiz.GetParent() === aba.overlay;
    }

    // Slate ainda despacha OnClicked quando o botão chama a ação. Só altere os widgets no próximo tick.
    function enfileirar(aba, acao, item) {
        if (aba.timerAcao !== undefined) return;
        aba.timerAcao = agendar(() => {
            aba.timerAcao = undefined;
            try {
                if (aindaEditando(aba) && (!item || aba.linhas.includes(item))) acao();
            } catch (erro) { avisar(erro); }
        }, 0);
    }

    function voltar(aba) {
        if (aba.familia) {
            const anterior = aba.familia;
            aba.familia = null;
            desenhar(aba, anterior);
            return;
        }
        if (aba.categoria === null) { fechar(true); return; }
        const anterior = aba.categoria;
        aba.categoria = null;
        desenhar(aba, anterior);
    }

    function adicionarGrade(aba, itens) {
        const grade = aba.visual.grade(aba.lista);
        const inicio = aba.fileiras.length;
        for (const [i, item] of itens.entries()) {
            const linha = Math.floor(i / aba.colunas), coluna = i % aba.colunas;
            const botao = aba.visual.botao(grade, item, linha, coluna);
            if (!valido(botao)) throw new Error("O jogo não criou o botão da personalização.");
            item.botao = botao;
            item.clique = () => {
                try {
                    if (aindaEditando(aba) && aba.linhas.includes(item) && !entradaDuplicada("botao")) {
                        enfileirar(aba, item.acao, item);
                    }
                } catch (erro) { avisar(erro); }
            };
            aba.linhas.push(item);
            if (!coluna) aba.fileiras.push([]);
            aba.fileiras[inicio + linha].push(item);
            botao.OnClicked.Add(item.clique);
        }
    }

    function ligarNavegacao(aba) {
        const nav = UE.EUINavigation, fileiras = aba.fileiras;
        for (const [i, item] of aba.linhas.entries()) {
            item.botao.SetNavigationRuleExplicit(nav.Previous, aba.linhas[Math.max(0, i - 1)].botao);
            item.botao.SetNavigationRuleExplicit(nav.Next, aba.linhas[Math.min(aba.linhas.length - 1, i + 1)].botao);
        }
        for (const [n, fileira] of fileiras.entries()) {
            const cima = fileiras[Math.max(0, n - 1)], baixo = fileiras[Math.min(fileiras.length - 1, n + 1)];
            for (const [c, {botao}] of fileira.entries()) {
                botao.SetNavigationRuleExplicit(nav.Up, cima[Math.min(c, cima.length - 1)].botao);
                botao.SetNavigationRuleExplicit(nav.Down, baixo[Math.min(c, baixo.length - 1)].botao);
                botao.SetNavigationRuleExplicit(nav.Left, fileira[Math.max(0, c - 1)].botao);
                botao.SetNavigationRuleExplicit(nav.Right, fileira[Math.min(fileira.length - 1, c + 1)].botao);
            }
        }
    }

    function grupos() { return opcoes().filter(g => g.itens.length); }

    function assinatura(op, aba) {
        return JSON.stringify([op.map(g => [g.chave, g.itens.length, ler(g.chave)]), vestida(aba)]);
    }

    function vestida(aba) {
        const comp = aba.pagina.appearanceComponent;
        return valido(comp) && nossa(comp.GetCurrentOutfit());
    }

    function desenhar(aba, focar) {
        const op = grupos();
        const grupo = op.find(g => g.chave === aba.categoria);
        if (!grupo) aba.categoria = null;
        limparLinhas(aba);
        aba.fileiras = [];
        aba.visual.secao(aba.lista, grupo ? (aba.familia ? grupo.rotulo + " · " + aba.familia : grupo.rotulo) : "Personalizar roupa");
        aba.assinatura = assinatura(op, aba);
        const acoes = [];
        if (grupo) {
            if (grupo.descricao && !aba.familia) aba.visual.nota(aba.lista, grupo.descricao);
            const construir = item => ({
                id: item.id, texto: item.nome, detalhe: item.detalhe, traje: item.traje, rgb: item.rgb,
                icone: item.icone || (grupo.chave === "chapeu" ? apresentacao.chapeus?.[item.id] : null),
                marcado: ler(grupo.chave) === item.id,
                acao() {
                    escolher(grupo.chave, item.id);
                    if (edicao === aba) desenhar(aba, item.id);
                }
            });
            const familias = new Map();
            for (const item of grupo.itens) {
                if (!item.familia) continue;
                if (!familias.has(item.familia)) familias.set(item.familia, []);
                familias.get(item.familia).push(item);
            }
            if (aba.familia && !familias.has(aba.familia)) aba.familia = null;
            if (familias.size && !aba.familia) {
                const entradas = grupo.itens.filter(item => !item.familia).map(construir);
                for (const [familia, tons] of familias) {
                    const amostra = tons[Math.floor(tons.length / 2)];
                    entradas.push({ id: familia, texto: familia, icone: amostra.icone, rgb: amostra.rgb,
                        marcado: tons.some(item => item.id === ler(grupo.chave)),
                        acao() { aba.familia = familia; desenhar(aba, ler(grupo.chave)); } });
                }
                adicionarGrade(aba, entradas);
            } else adicionarGrade(aba, (familias.get(aba.familia) || grupo.itens).map(construir));
        } else {
            for (const [titulo, chaves] of secoes) {
                const categorias = chaves.map(chave => op.find(g => g.chave === chave)).filter(Boolean);
                if (!categorias.length) continue;
                aba.visual.secao(aba.lista, titulo);
                adicionarGrade(aba, categorias.map(g => {
                    const atual = g.itens.find(item => item.id === ler(g.chave));
                    return { id: g.chave, texto: g.rotulo,
                        detalhe: atual?.nome || "Escolher",
                        acao() { aba.categoria = g.chave; aba.familia = null; desenhar(aba, atual?.familia || ler(g.chave)); } };
                }));
            }
            if (!vestida(aba)) acoes.push({ id: "equipar", texto: "Equipar roupa personalizada", acao() {
                const pagina = aba.pagina;
                fechar(true);
                equipando = pagina;
                try { pagina.confirmOutfit(roupa); } finally { equipando = undefined; }
            } });
        }
        acoes.push({ id: "voltar", texto: aba.familia ? "Voltar às cores" : grupo ? "Voltar ao Ateliê" : "Voltar às roupas", acao: () => voltar(aba) });
        adicionarGrade(aba, acoes);
        ligarNavegacao(aba);
        const alvo = (aba.linhas.find(item => item.id === focar) || aba.linhas[0]).botao;
        alvo.SetUserFocus(aba.controle);
        aba.scroll.ScrollWidgetIntoView(alvo, false, UE.EDescendantScrollDestination.IntoView, 8);
        aba.visual.foco(aba.linhas, aba.controle);
        informar(grupo ? "aba_opcoes" : "aba_categorias");
    }

    function medir(overlay, pagina) {
        if (typeof overlay.GetCachedGeometry === "function") {
            const tamanho = UE.SlateBlueprintLibrary.GetLocalSize(overlay.GetCachedGeometry());
            if (tamanho && tamanho.X > 0 && tamanho.Y > 0) return tamanho;
        }
        const layout = UE.WidgetLayoutLibrary;
        if (!layout || typeof layout.GetViewportSize !== "function" || typeof layout.GetViewportScale !== "function") return null;
        const pixels = layout.GetViewportSize(pagina), escala = layout.GetViewportScale(pagina);
        return pixels && pixels.X > 0 && pixels.Y > 0 && escala > 0 ? { X: pixels.X / escala, Y: pixels.Y / escala } : null;
    }

    function abrir(pagina, cartao) {
        if (edicao || !podeAbrir(pagina, cartao)) return false;
        const painel = pagina.W_SystemPanel, overlay = painel.GetParent();
        if (!valido(overlay) || !overlay.IsA(UE.Overlay.StaticClass())) return false;
        const aba = { pagina, cartao, overlay, controle: pagina.GetOwningPlayer(), linhas: [], categoria: null, ocultos: [] };
        edicao = aba;
        try {
            aba.raiz = UE.NewObject(UE.SizeBox.StaticClass(), pagina);
            const slot = overlay.AddChildToOverlay(aba.raiz);
            const margem = new UE.Margin();
            margem.Left = 95; margem.Top = 245;
            let largura = 550, altura = 510;
            const tamanho = medir(overlay, pagina);
            if (tamanho && tamanho.X > 0 && tamanho.Y > 0) {
                largura = Math.min(largura, tamanho.X * .46);
                margem.Left = Math.min(margem.Left, tamanho.X * .07);
                margem.Top = Math.min(margem.Top, tamanho.Y * .24);
                altura = Math.max(140, Math.min(590, tamanho.Y - margem.Top - 90));
            }
            aba.raiz.SetWidthOverride(largura);
            aba.colunas = largura >= 450 ? 2 : 1;
            aba.raiz.SetHeightOverride(altura);
            slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Left);
            slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Top);
            slot.SetPadding(margem);
            aba.scroll = UE.NewObject(UE.PBZScrollBoxBase.StaticClass(), pagina);
            aba.raiz.AddChild(aba.scroll);
            if (typeof aba.scroll.SetScrollWhenFocusChanges === "function" && UE.EScrollWhenFocusChanges) {
                aba.scroll.SetScrollWhenFocusChanges(UE.EScrollWhenFocusChanges.InstantScroll);
            }
            aba.lista = UE.NewObject(UE.VerticalBox.StaticClass(), pagina);
            aba.scroll.AddChild(aba.lista);
            aba.visual = apresentacao.criar(UE, pagina);
            const ancestrais = new Set();
            for (let pai = overlay; valido(pai) && !ancestrais.has(pai); pai = pai.GetParent()) ancestrais.add(pai);
            for (const w of new Set([painel, pagina.ScaleBox_0, pagina.PBZCommonLocRichText_0, pagina.Image_153])) {
                if (!valido(w) || ancestrais.has(w) || !w.IsVisible()) continue;
                aba.ocultos.push([w, w.GetVisibility()]);
                w.SetVisibility(UE.ESlateVisibility.Collapsed);
            }
            // O Hair Studio reutiliza a mesma página ao trocar de aba. Devolve a grade antes da transição.
            const finalizar = pagina.FinishCurrentWidget;
            if (!compat.studioRegistered() && typeof finalizar === "function") {
                aba.descFinalizar = Object.getOwnPropertyDescriptor(pagina, "FinishCurrentWidget");
                aba.finalizar = function (...args) {
                    if (edicao === aba) fechar(false);
                    return finalizar.apply(this, args);
                };
                // Algumas instâncias expõem apenas o método do protótipo. A verificação da aba continua ativa a cada atualização.
                try { Object.defineProperty(pagina, "FinishCurrentWidget", { configurable: true, writable: true, value: aba.finalizar }); }
                catch (erro) { aba.finalizar = undefined; avisar(erro); }
            }
            desenhar(aba);
            return true;
        } catch (erro) { fechar(true); informar("falha_ao_montar"); avisar(erro); return false; }
    }

    function instalarHooks(classe) {
        if (hooks) return;
        const api = nativos(), referencias = [];
        const bp = puerts.blueprint.tojs(classe).prototype;
        const donos = [...new Set([api.mixin, bp])];
        const equipar = api.mixin.confirmOutfit, back = api.mixin.BackInput;
        if (typeof equipar !== "function" || typeof back !== "function") throw new Error("Ações de Aparência indisponíveis.");
        function confirm(anterior, id, ...args) {
            if (compat.studioOwnsMenu(this)) return;
            if (equipando === this) return anterior.call(this, id, ...args);
            if (!encerrado && edicao?.pagina === this && aindaEditando(edicao)) {
                const item = edicao.linhas.find(x => x.botao.HasUserFocus(edicao.controle) ||
                    x.botao.HasUserFocusedDescendants(edicao.controle));
                if (item && !entradaDuplicada("tecla")) enfileirar(edicao, item.acao, item);
                return;
            }
            if (!encerrado && nossa(id) && observado?.pagina === this && paginaLocal(this) &&
                naAparencia(this) && visivel(this.W_SystemPanel)) {
                // CommonUI pode disparar Confirm antes de selecionar o quadrado que recebeu o clique.
                if (!nossa(cartaoAtual(this)?.AccessoryOutFitID)) return;
                if (entradaDuplicada("tecla")) return;
                if (abrir(this, cartaoAtual(this))) return;
            }
            return anterior.call(this, id, ...args);
        }
        function recuar(anterior, ...args) {
            if (compat.studioOwnsMenu(this)) return anterior.apply(this, args);
            if (!encerrado && edicao?.pagina === this && aindaEditando(edicao)) {
                const aba = edicao;
                enfileirar(aba, () => voltar(aba));
                return;
            }
            return anterior.apply(this, args);
        }
        try {
            for (const [nome, tratar] of [["BackInput", recuar], ["confirmOutfit", confirm]]) {
                const bases = donos.map(d => d[nome] || api.mixin[nome]);
                const baseMixin = bases[0];
                for (const dono of donos) {
                    const anterior = bases[donos.indexOf(dono)];
                    const desc = Object.getOwnPropertyDescriptor(dono, nome);
                    // Algumas classes encaminham o método refletido de volta ao seu mixin JS.
                    const emExecucao = new Set();
                    const fn = function (...args) {
                        if (emExecucao.has(this)) return baseMixin.apply(this, args);
                        emExecucao.add(this);
                        try { return tratar.call(this, anterior, ...args); }
                        finally { emExecucao.delete(this); }
                    };
                    Object.defineProperty(dono, nome, { configurable: true, writable: true, value: fn });
                    referencias.push({ dono, nome, fn, desc });
                }
            }
        } catch (erro) { restaurarHooks(referencias); throw erro; }
        entrada = api.entrada;
        hooks = { referencias };
    }

    function restaurarHooks(refs) {
        for (const { dono, nome, fn, desc } of refs.slice().reverse()) {
            if (dono[nome] !== fn) continue;
            if (desc) Object.defineProperty(dono, nome, desc);
            else Reflect.deleteProperty(dono, nome);
        }
    }

    function rearmar(atual) {
        const pagina = atual.pagina, cartao = cartaoAtual(pagina);
        if (atual.rearmando || compat.studioOwnsMenu(pagina) || observado !== atual || encerrado || !valido(cartao) || !nossa(cartao.AccessoryOutFitID) ||
            !vestida({ pagina }) || atual.confirmavel === cartao ||
            !(edicao?.pagina === pagina && aindaEditando(edicao) || podeAbrir(pagina, cartao)) ||
            typeof pagina.ensureReplaceOutfitLambda !== "function") return;
        // O jogo retira "Trocar" da barra quando a roupa já está equipada.
        pagina.ensureReplaceOutfitLambda();
        if (pagina.replaceOutfitLambda) {
            atual.confirmavel = cartao; atual.rearmando = true;
            try { pagina.BindKeyDelegate.Broadcast(entrada.MakePBZInputDataTableHandle("WeaponConfirm"), true,
                pagina.replaceOutfitLambda, UE.EInputEvent.IE_Pressed); }
            catch (erro) { atual.confirmavel = null; throw erro; }
            finally { atual.rearmando = false; }
        }
    }

    function abrirCliquePendente(atual) {
        const clique = atual.pendente;
        if (!clique) return;
        if (agora() - clique.tempo > 600) { atual.pendente = null; return; }
        if (!podeAbrir(atual.pagina, clique.botao)) return;
        atual.pendente = null;
        if (!entradaDuplicada("cartao")) abrir(atual.pagina, clique.botao);
    }

    function observar(pagina) {
        const grupo = pagina?.W_SystemPanel?.ButtonGroup;
        if (observado?.pagina === pagina && observado?.grupo === grupo && observado?.viaStudio === compat.studioRegistered()) return;
        const anterior = observado;
        observado = undefined;
        if (anterior && valido(anterior.grupo)) {
            anterior.grupo.OnButtonBaseClicked.Remove(anterior.clique);
            anterior.grupo.OnSelectedButtonBaseChanged?.Remove(anterior.selecao);
        }
        if (anterior && valido(anterior.pagina) && anterior.pagina.refreshReplaceOutfitInputBar === anterior.refresh) {
            if (anterior.descRefresh) Object.defineProperty(anterior.pagina, "refreshReplaceOutfitInputBar", anterior.descRefresh);
            else Reflect.deleteProperty(anterior.pagina, "refreshReplaceOutfitInputBar");
        }
        if (!valido(grupo) || !grupo.OnButtonBaseClicked) return;
        if (compat.studioOwnsMenu(pagina)) return;
        const atual = { pagina, grupo, viaStudio: compat.studioRegistered() };
        atual.clique = botao => {
            try {
                atual.pendente = null;
                if (observado !== atual || edicao || !valido(botao) || !nossa(botao.AccessoryOutFitID) ||
                    !paginaLocal(pagina) || !naAparencia(pagina) || !visivel(pagina.W_SystemPanel)) return;
                atual.pendente = { botao, tempo: agora() };
                abrirCliquePendente(atual);
            } catch (erro) { avisar(erro); }
        };
        atual.selecao = botao => {
            try {
                if (observado !== atual) return;
                if (atual.pendente?.botao !== botao) atual.pendente = null;
                abrirCliquePendente(atual);
            } catch (erro) { avisar(erro); }
        };
        grupo.OnButtonBaseClicked.Add(atual.clique);
        grupo.OnSelectedButtonBaseChanged?.Add(atual.selecao);
        observado = atual;
        const refresh = pagina.refreshReplaceOutfitInputBar;
        if (!atual.viaStudio && typeof refresh === "function") {
            atual.descRefresh = Object.getOwnPropertyDescriptor(pagina, "refreshReplaceOutfitInputBar");
            atual.refresh = function (...args) {
                const retorno = refresh.apply(this, args);
                if (observado === atual) {
                    atual.confirmavel = null;
                    try { rearmar(atual); } catch (erro) { avisar(erro); }
                }
                return retorno;
            };
            // O Hair Studio verifica a função no protótipo. A escuta pertence só a esta instância visível.
            try { Object.defineProperty(pagina, "refreshReplaceOutfitInputBar", { configurable: true, writable: true, value: atual.refresh }); }
            catch (erro) { avisar(erro); }
        }
    }

    function atualizar(contexto) {
        if (encerrado) return;
        jogo = contexto;
        ultimaPagina = null;
        try {
            const classe = valido(jogo) && UE.Object.Find(classePagina);
            let atual, donoAtual;
            if (valido(classe)) {
                instalarHooks(classe);
                const paginas = widgets(classe);
                for (let i = 0; i < paginas.Num(); i++) {
                    const p = paginas.Get(i);
                    if (!paginaLocal(p)) continue;
                    const dono = donoDaPagina(p);
                    if (!naAparencia(p, dono)) continue;
                    if (atual) { visita = null; fechar(false); observar(null); informar("paginas_ambiguas"); return; }
                    atual = p; donoAtual = dono;
                }
            }
            if (edicao && (edicao.pagina !== atual || !aindaEditando(edicao))) fechar(false);
            observar(atual);
            if (!atual) {
                // A própria reentrada pode suspender a página por alguns ticks. Só a aba real mantém a mesma visita.
                if (!visita?.reabriu || !valido(visita.dono) || !visivel(visita.dono) || !valido(visita.dono.TabList) ||
                    String(visita.dono.TabList.GetSelectedTabId()).toLowerCase() !== "appearance") visita = null;
                informar("pagina_fechada");
                return;
            }
            ultimaPagina = atual;
            try {
                if (conferirPrevia(atual, donoAtual)) {
                    ultimaPagina = null;
                    informar("reabrindo_aparencia");
                    return;
                }
            }
            catch (erro) { avisar("Prévia da Aparência: " + erro); }
            if (!edicao && observado) abrirCliquePendente(observado);
            if (edicao) {
                const op = grupos();
                if (assinatura(op, edicao) !== edicao.assinatura) desenhar(edicao);
                edicao.visual.foco(edicao.linhas, edicao.controle);
                informar(edicao.categoria === null ? "aba_categorias" : "aba_opcoes");
                return;
            }
            const cartao = cartaoAtual(atual);
            if (!valido(cartao) || !nossa(cartao.AccessoryOutFitID)) {
                if (observado) observado.confirmavel = null;
                informar(valido(cartao) ? "outro_cartao" : "sem_selecao");
                return;
            }
            informar("cartao_pronto");
            if (observado) rearmar(observado);
        } catch (erro) { ultimaPagina = null; fechar(false); informar("falha_ao_ler_pagina"); avisar(erro); }
    }

    function paginaAtiva() {
        try {
            if (!encerrado && ultimaPagina && paginaLocal(ultimaPagina) && naAparencia(ultimaPagina)) return ultimaPagina;
        } catch (erro) { avisar(erro); }
        return null;
    }

    function suspenderMenu(pagina) {
        if (edicao?.pagina === pagina) fechar(false);
        if (observado?.pagina === pagina) {
            const anterior = observado;
            // Only remove our own card callbacks and the instance wrapper.
            // Studio installs its own confirm action after this synchronous handover.
            observar(null);
            anterior.pendente = null;
        }
        if (ultimaPagina === pagina) ultimaPagina = null;
        visita = null; ultimaEntrada = null;
    }
    function entradaNativaAtualizada(pagina) {
        if (encerrado || compat.studioOwnsMenu(pagina) || observado?.pagina !== pagina) return;
        const atual = observado;
        if (atual.rearmando) return;
        atual.confirmavel = null;
        try { rearmar(atual); } catch (erro) { avisar(erro); }
    }
    return { atualizar, paginaAtiva, suspenderMenu, entradaNativaAtualizada, parar() {
        encerrado = true;
        fechar(true);
        if (observado?.confirmavel && paginaLocal(observado.pagina) && observado.confirmavel === cartaoAtual(observado.pagina)) {
            observado.pagina.refreshReplaceOutfitInputBar();
        }
        observar(null);
        if (hooks) restaurarHooks(hooks.referencias);
    } };
};
