"use strict";
const paleta = require("./paleta");
const { modelos } = require("./roupas");

const original = Object.freeze([{ id: "Original", nome: "Original" }]);
const malhasRoupa = new Map(Object.entries(modelos).map(([id, roupa]) => [id,
    new Set([roupa.malha, roupa.malhaTecido, ...roupa.panosCima, ...roupa.panosBaixo].filter(Boolean).map(n => n.toLowerCase()))
]));
const chapeus = new Map(Object.entries({ Fengxue: "FengXue", Changhong: "ChangHong", Bambu: "00",
    BambuGasto: "01", Legacy: "MoTian", Zhuiming: "Hook", YaYu: "YaYu" }).map(([id, sufixo]) => {
    const n = "Hun_Hat_" + sufixo;
    return [id, ("/HuaShira/Characters/Hero/Hero_Hun/Hats/" + n + "." + n).toLowerCase()];
}));
exports.opcoesRoupa = id => malhasRoupa.has(id) ? paleta.opcoes() : original;
exports.opcoesChapeu = id => chapeus.has(id) ? paleta.opcoes() : original;

const anatomia = /skin|face|eye|teeth|tongue|scalp|head|nail|hair|groom|beard/i;
const roupa = /cloth|cloak|fabric|coat|armor|armour|metal|cape|leather|belt|boot|glove|pant|sleeve|rope|skirt|fur|strap|scarf|buckle|sash/i;
const entrada = (lista, i) => lista && i < lista.Num() ? lista.Get(i) : null;
const numero = (a, b) => Number.isFinite(a) && Math.abs(a - b) < .0001;
function rgba(c) { return c && [c.R, c.G, c.B, c.A]; }
function igual(v, w) { return !!v && !!w && v.every((n, i) => numero(n, w[i])); }

exports.criar = function criar(UE, valido, avisar) {
    const estados = new Map(), visitados = new Set(), semParametro = new WeakSet();
    const info = new UE.MaterialParameterInfo();
    info.Name = "Albedo Overlay";
    info.Association = UE.EMaterialParameterAssociation.LayerParameter;
    info.Index = 0;
    let corRoupa, corChapeu;
    const caminho = m => valido(m) ? String(UE.KismetSystemLibrary.GetPathName(m)).toLowerCase() : "";
    const dinamico = m => m.IsA(UE.MaterialInstanceDynamic.StaticClass());
    const lerCor = mid => rgba(mid.K2_GetVectorParameterValueByInfo(info));
    const parametroCor = p => String(p.Name) === info.Name && p.Association === info.Association && p.Index === info.Index;
    const nome = m => caminho(m).split(".").pop();
    function escreverCor(mid, valores) {
        const vetor = new UE.LinearColor();
        [vetor.R, vetor.G, vetor.B, vetor.A] = valores;
        mid.SetVectorParameterValueByInfo(info, vetor);
        return igual(lerCor(mid), valores);
    }
    function declarado(pai) {
        // O getter da UE retorna (0,0,0,1) para nomes inexistentes. Um valor preto explícito
        // no material constante também é válido. Ignore overrides que só existem em um MID.
        for (let n = 0; n < 12 && valido(pai); n++, pai = pai.Parent) {
            const vs = pai.VectorParameterValues;
            for (let i = 0, total = vs ? vs.Num() : 0; i < total; i++) {
                if (parametroCor(vs.Get(i).ParameterInfo)) return true;
            }
        }
        return false;
    }
    function elegivel(fonte, slot, exclusiva) {
        const pai = dinamico(fonte) ? fonte.Parent : fonte;
        const path = caminho(pai);
        if (!path.startsWith("/game/pbzcontent/") && !path.startsWith("/huashira/")) return null;
        const nomes = nome(pai) + " " + (slot?.MaterialSlotName || "");
        if (anatomia.test(nomes) || (!exclusiva && !roupa.test(nomes))) return null;
        return pai;
    }
    function assinatura(tipo, v) {
        if (tipo === "Vector") return rgba(v)?.join("/");
        return tipo === "Texture" ? caminho(v) : v;
    }
    // Snapshot de valores JS comuns; nenhuma referência a um elemento de TArray sobrevive ao tick.
    function acompanhar(r, inicial) {
        if (!r.vivos || !valido(r.fonte)) return;
        const vistos = new Set();
        for (const tipo of ["Scalar", "Vector", "Texture"]) {
            const lista = r.fonte[tipo + "ParameterValues"];
            for (let i = 0, total = lista ? lista.Num() : 0; i < total; i++) {
                const item = lista.Get(i), p = item.ParameterInfo;
                if (tipo === "Vector" && parametroCor(p)) continue;
                const k = [tipo, p.Name, p.Association, p.Index].join("/");
                const valor = item.ParameterValue, atual = assinatura(tipo, valor);
                const antigo = r.vivos.get(k);
                vistos.add(k);
                if (antigo && antigo.valor === atual) continue;
                const ler = "K2_Get" + tipo + "ParameterValueByInfo";
                const gravar = "Set" + tipo + "ParameterValueByInfo";
                if (!inicial && (!antigo || assinatura(tipo, r.mid[ler](p)) === antigo.valor)) {
                    r.mid[gravar](p, valor);
                }
                r.vivos.set(k, { tipo, nome: String(p.Name), associacao: p.Association, indice: p.Index, valor: atual });
            }
        }
        for (const [k, anterior] of r.vivos) {
            if (vistos.has(k)) continue;
            const p = new UE.MaterialParameterInfo();
            p.Name = anterior.nome; p.Association = anterior.associacao; p.Index = anterior.indice;
            const ler = "K2_Get" + anterior.tipo + "ParameterValueByInfo";
            if (assinatura(anterior.tipo, r.mid[ler](p)) === anterior.valor) {
                r.mid["Set" + anterior.tipo + "ParameterValueByInfo"](p, r.fonte[ler](p));
            }
            r.vivos.delete(k);
        }
    }
    function preparar(c, i, fonte, pai, valores, r) {
        if (semParametro.has(pai)) return "sem_parametro";
        // CreateDynamicMaterialInstance(slot, ...) no componente já altera o slot. O MID
        // temporário da biblioteca permite inspecionar o pai originalmente herdado antes de exibi-lo.
        const mid = UE.KismetMaterialLibrary.CreateDynamicMaterialInstance(c, pai, "None", 0);
        if (!valido(mid) || mid.Parent !== pai) return "instancia_indisponivel";
        const herdada = lerCor(mid);
        if (!herdada?.every(Number.isFinite) || (igual(herdada, [0,0,0,1]) && !declarado(pai))) {
            semParametro.add(pai);
            return "sem_parametro";
        }
        if (dinamico(fonte)) {
            if (!igual(lerCor(fonte), herdada)) return "cor_de_outro_controlador";
            mid.CopyParameterOverrides(fonte);
            r.vivos = new Map();
        }
        if (!escreverCor(mid, valores) || c.GetMaterial(i) !== fonte) return "aplicacao_recusada";
        r.anterior = entrada(c.OverrideMaterials, i);
        r.mid = mid; r.herdada = herdada; r.cor = valores;
        acompanhar(r, true);
        c.SetMaterial(i, mid);
        if (c.GetMaterial(i) === mid) return null;
        r.mid = null;
        return "material_substituido";
    }
    function restaurar(c, e, i, r) {
        if (!valido(r.mid) || !valido(c) || i >= c.GetNumMaterials() || c.GetMaterial(i) !== r.mid) return;
        if (!igual(lerCor(r.mid), r.cor)) return;
        const anterior = e.ler(c) === e.malha && valido(r.anterior) ? r.anterior : null;
        c.SetMaterial(i, anterior);
    }
    function liberar(c, e) {
        estados.delete(c);
        for (const [i,r] of e.slots) restaurar(c,e,i,r);
    }
    function visitar(c, ler, id, chapeu) {
        const rgb = paleta.cor(chapeu ? corChapeu : corRoupa);
        if (!rgb || !valido(c) || c.bHiddenInGame || !c.IsVisible()) return 0;
        const malha = ler(c), path = caminho(malha);
        if (!path || (chapeu ? chapeus.get(id) !== path : !malhasRoupa.get(id)?.has(path))) return 0;
        visitados.add(c);
        let e = estados.get(c);
        if (e && (e.id !== id || e.malha !== malha)) { liberar(c,e); e = null; }
        if (!e) { e = { id, malha, ler, slots:new Map(), retomados:new Set() }; estados.set(c,e); }
        const exclusiva = chapeu || path !== modelos[id].malha.toLowerCase();
        const valores = [...rgb,1];
        let aplicados = 0;
        for (let i = 0, n = c.GetNumMaterials(); i < n; i++) {
            const material = c.GetMaterial(i);
            let r = e.slots.get(i);
            if (r?.mid) {
                if (valido(r.mid) && material === r.mid && igual(lerCor(r.mid), r.cor)) {
                    if (r.vivos && valido(r.fonte) && !igual(lerCor(r.fonte), r.herdada)) {
                        restaurar(c,e,i,r);
                        r.mid = null; r.motivo = "cor_de_outro_controlador"; continue;
                    }
                    acompanhar(r,false);
                    if (!igual(r.cor,valores)) {
                        if (!escreverCor(r.mid,valores)) continue;
                        r.cor = valores;
                    }
                    aplicados++;
                    continue;
                }
                // A aplicação assíncrona do PBZ pode recolocar exatamente o material anterior.
                // Tolere essa reposição uma vez; ceda em caso de atividade contínua ou de outra fonte.
                if (material === r.fonte && !e.retomados.has(i)) {
                    e.retomados.add(i);
                    r = null;
                } else {
                    r.mid = null; r.fonte = material; r.motivo = "material_substituido";
                }
            }
            if (!valido(material) || r?.fonte === material) continue;
            const slot = entrada(malha.Materials,i), pai = elegivel(material,slot,exclusiva);
            r = { fonte:material, material:nome(pai || material), motivo:null };
            e.slots.set(i,r);
            if (!pai) continue;
            // Um override constante de fora da malha tem prioridade. O slot vazio de pelo de
            // Changhong pode receber o reparo nativo do módulo de vestuário.
            const doAsset = slot?.MaterialInterface;
            if (valido(doAsset) && doAsset !== pai && !caminho(doAsset).startsWith("/engine/enginematerials/")) {
                r.motivo = "material_substituido"; continue;
            }
            r.motivo = preparar(c,i,material,pai,valores,r);
            if (!r.motivo) aplicados++;
        }
        return aplicados;
    }
    return {
        inicio(a,b) { corRoupa = a; corChapeu = b; visitados.clear(); },
        roupa:(c,ler,id) => visitar(c,ler,id,false),
        chapeu:(c,ler,id) => visitar(c,ler,id,true),
        detalhes(c) {
            const saida = [];
            for (const r of estados.get(c)?.slots.values() || []) {
                if (r.motivo && saida.length < 8) saida.push({material:r.material,motivo:r.motivo});
            }
            return saida;
        },
        fim() { for (const [c,e] of estados) if (!visitados.has(c)) liberar(c,e); },
        parar() { for (const [c,e] of estados) liberar(c,e); visitados.clear(); }
    };
};
