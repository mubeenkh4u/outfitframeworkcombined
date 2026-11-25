"use strict";

const chapeus = { Fengxue: "HFen", Changhong: "HCha", Bambu: "H00_", BambuGasto: "H01_",
    Legacy: "HMot", Zhuiming: "HHoo" };
const icones = new Set(Object.values(chapeus));
const pastaAmostras = "/Game/PBZContent/UI/UINew/items/";

exports.chapeus = chapeus;
exports.criar = function criar(UE, pagina) {
    function cor(r, g, b) {
        const tinta = new UE.LinearColor();
        tinta.R = r; tinta.G = g; tinta.B = b; tinta.A = 1;
        return tinta;
    }
    const novo = classe => UE.NewObject(classe.StaticClass(), pagina);
    const texturas = new Map();
    const corBase = cor(.18, .19, .20);
    const corFoco = cor(.69, .45, .18);
    let anterior;

    function margem(esquerda, topo, direita, baixo) {
        const m = new UE.Margin();
        m.Left = esquerda; m.Top = topo; m.Right = direita; m.Bottom = baixo;
        return m;
    }

    function texto(lista, valor, tamanho, rgb, negrito) {
        const rotulo = novo(UE.TextBlock);
        const slot = lista.AddChildToVerticalBox(rotulo);
        const fonte = rotulo.Font;
        fonte.Size = tamanho;
        fonte.TypefaceFontName = negrito ? "Bold" : "Regular";
        rotulo.SetFont(fonte);
        const tinta = new UE.SlateColor();
        tinta.ColorUseRule = UE.ESlateColorStylingMode.UseColor_Specified;
        tinta.SpecifiedColor = cor(...rgb);
        rotulo.SetColorAndOpacity(tinta);
        rotulo.SetAutoWrapText(true);
        rotulo.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        rotulo.SetText(UE.KismetTextLibrary.Conv_StringToText(valor));
        return slot;
    }

    function secao(lista, titulo) {
        texto(lista, titulo, 19, [1, .88, .68], true).SetPadding(margem(5, 9, 4, 4));
    }

    function nota(lista, mensagem) {
        texto(lista, mensagem, 14, [.86, .86, .84], false).SetPadding(margem(5, 2, 5, 6));
    }

    function grade(lista) {
        const grid = novo(UE.UniformGridPanel);
        lista.AddChildToVerticalBox(grid);
        grid.SetMinDesiredSlotHeight(54);
        grid.SetSlotPadding(margem(3, 3, 3, 3));
        return grid;
    }

    function textura(icone, traje) {
        let caminho;
        if (icones.has(icone)) {
            const nome = "T_Icon_Appearance_SoulRecolor" + icone;
            caminho = pastaAmostras + nome + "." + nome;
        } else if (typeof icone === "string" && icone.startsWith("/Game/")) {
            caminho = icone;
        } else if (typeof traje === "string" && traje.startsWith("/Game/")) {
            caminho = traje;
        } else return null;
        if (texturas.has(caminho)) {
            const mem = texturas.get(caminho);
            if (!mem || UE.KismetSystemLibrary.IsValid(mem)) return mem;
        }
        let resultado = null;
        try {
            const asset = UE.Object.Load(caminho);
            if (asset && UE.KismetSystemLibrary.IsValid(asset) && asset.IsA(UE.Texture2D.StaticClass())) resultado = asset;
        } catch (_) { /* A opção continua identificada pelo nome quando a miniatura é opcional. */ }
        texturas.set(caminho, resultado);
        return resultado;
    }

    function botao(destino, item, linha, coluna) {
        const w = novo(UE.Button);
        const celula = destino.AddChildToUniformGrid(w, linha, coluna);
        celula.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
        celula.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
        w.SetBackgroundColor(corBase);
        const faixa = novo(UE.HorizontalBox);
        const conteudo = w.AddChild(faixa);
        conteudo.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);
        conteudo.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Center);
        conteudo.SetPadding(margem(8, 5, 8, 5));
        faixa.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        const amostra = textura(item.icone, item.traje);
        if (amostra) {
            const imagem = novo(UE.Image);
            const slot = faixa.AddChildToHorizontalBox(imagem);
            slot.SetPadding(margem(0, 0, 7, 0));
            slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Center);
            imagem.SetBrushFromTexture(amostra, false);
            if (item.rgb) imagem.SetColorAndOpacity(cor(...item.rgb));
            imagem.SetDesiredSizeOverride(new UE.Vector2D(34, 34));
            imagem.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        }
        const legendas = novo(UE.VerticalBox);
        const area = faixa.AddChildToHorizontalBox(legendas);
        const preencher = new UE.SlateChildSize();
        preencher.SizeRule = UE.ESlateSizeRule.Fill; preencher.Value = 1;
        area.SetSize(preencher);
        area.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Center);
        texto(legendas, item.texto, 17, [1, 1, 1], true);
        if (item.detalhe) texto(legendas, item.detalhe, 14, [.82, .84, .85], false);
        if (item.marcado) texto(legendas, "Em uso", 13, [1, .85, .54], true);
        return w;
    }

    function foco(linhas, controle) {
        const atual = linhas.find(({botao}) => botao.HasUserFocus(controle) || botao.HasUserFocusedDescendants(controle))?.botao;
        if (anterior === atual) return;
        if (anterior && UE.KismetSystemLibrary.IsValid(anterior)) anterior.SetBackgroundColor(corBase);
        if (atual) atual.SetBackgroundColor(corFoco);
        anterior = atual;
    }
    return { secao, nota, grade, botao, foco };
};
