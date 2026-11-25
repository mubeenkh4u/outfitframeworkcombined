"use strict";

exports.criar = function (UE, P, padroes, avisar) {
    const valores = { ...padroes };
    let arquivo, pronto = false, bloqueado = false, anterior = null;
    function lerArquivo(nome) {
        if (!UE.BlueprintPathsLibrary.FileExists(nome)) return null;
        const texto = P.$ref("");
        if (!UE.EasyCsv.LoadStringFromLocalFile(nome, texto)) throw new Error("Falha de leitura.");
        return String(P.$unref(texto)).replace(/^\uFEFF/, "");
    }
    function abrir() {
        if (pronto) return;
        const k = UE.KismetSystemLibrary;
        const pasta = k.ConvertToAbsolutePath(k.GetProjectSavedDirectory()).replace(/[\\/]+$/, "");
        arquivo = pasta + "/ACAtelieSoul-visual.json";
        try {
            anterior = lerArquivo(arquivo);
            if (anterior !== null) {
                const doc = JSON.parse(anterior);
                if (doc.versao !== 1 || !doc.escolhas || typeof doc.escolhas !== "object") throw new Error();
                for (const chave of Object.keys(valores)) {
                    if (typeof doc.escolhas[chave] === "string") valores[chave] = doc.escolhas[chave];
                }
            } else {
                const legado = lerArquivo(pasta + "/ACAtelieSoul.json");
                if (legado) {
                    try {
                        const escolhas = JSON.parse(legado).escolhas || {};
                        if (escolhas.cima === escolhas.baixo && typeof escolhas.cima === "string") valores.conjunto = escolhas.cima;
                        if (typeof escolhas.chapeu === "string") valores.chapeu = escolhas.chapeu;
                    } catch (_) { /* As preferências novas funcionam mesmo se o histórico estiver ilegível. */ }
                }
            }
        } catch (_) {
            bloqueado = true;
            avisar("Não consegui ler a configuração do Ateliê. As escolhas desta sessão não serão gravadas.");
        }
        pronto = true;
    }
    function salvar() {
        if (!pronto || bloqueado) return;
        try {
            const novo = JSON.stringify({ versao: 1, escolhas: valores }, null, 2);
            if (anterior === novo) return;
            if (anterior !== null && !UE.EasyCsv.SaveStringToFileWithFullPath(anterior, arquivo + ".bak")) throw new Error();
            if (!UE.EasyCsv.SaveStringToFileWithFullPath(novo, arquivo) || lerArquivo(arquivo) !== novo) throw new Error();
            anterior = novo;
        } catch (_) {
            avisar("A seleção está ativa nesta sessão, mas o jogo não conseguiu gravar ACAtelieSoul-visual.json.");
        }
    }
    return { valores, abrir, salvar };
};
