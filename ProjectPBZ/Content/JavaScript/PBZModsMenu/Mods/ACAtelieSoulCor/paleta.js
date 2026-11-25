"use strict";

// Soul's Appearance Studio, de Szy1115 (Nexus Mods 559), fornece os tons
// pelo catálogo da instalação do jogador. O Ateliê fornece os rótulos em português.
const familias = {
    ink: "Preto", gray: "Cinza", white: "Branco", brown: "Marrom",
    red: "Vermelho", orange: "Laranja", yellow: "Amarelo", lime: "Verde-lima",
    green: "Verde", teal: "Verde-azulado", cyan: "Ciano", blue: "Azul",
    violet: "Violeta", pink: "Rosa"
};
const original = Object.freeze({ id: "Original", nome: "Original", rgb: null });
let opcoesCarregadas;
let porId;

function opcoes() {
    if (opcoesCarregadas) return opcoesCarregadas;
    const lista = [original];
    porId = new Map();
    try {
        const catalogo = require("PBZModsMenu/Mods/PBZSoulHairStudioMenu/catalog");
        if (!Array.isArray(catalogo.palette) || !catalogo.palette.length || typeof catalogo.linear !== "function") {
            throw new Error("catálogo de cores incompatível");
        }
        for (const item of catalogo.palette) {
            const formato = /^([a-z]+)_([1-9]\d*)$/.exec(item.id);
            if (!formato || !/^#[\da-f]{6}$/i.test(item.hex) || porId.has(item.id)) {
                throw new Error("identificador ou amostra de cor inválida");
            }
            const rgb = catalogo.linear(item.hex);
            if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every(c => Number.isFinite(c) && c >= 0 && c <= 1)) {
                throw new Error("valor de cor inválido");
            }
            const familia = familias[formato[1]] || formato[1];
            const opcao = Object.freeze({
                id: item.id, nome: familia + " · tom " + formato[2], familia,
                rgb: Object.freeze(rgb), hex: item.hex, icone: catalogo.paths?.colorStroke
            });
            porId.set(item.id, opcao.rgb);
            lista.push(opcao);
        }
    } catch (erro) {
        console.warn("[ACAtelieSoulCor] Confira a instalação de Soul's Appearance Studio (mod 559) para usar as cores. " + erro);
        lista.length = 1;
        porId.clear();
    }
    opcoesCarregadas = Object.freeze(lista);
    return opcoesCarregadas;
}

function cor(id) {
    opcoes();
    return porId.get(id) || null;
}

module.exports = { opcoes, cor };
