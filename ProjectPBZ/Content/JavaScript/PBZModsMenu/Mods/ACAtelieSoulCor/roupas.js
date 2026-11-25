"use strict";

// Recursos de BodyMeshAsset e BodyClothDataArray conferidos no catálogo do PBZ.
function corpo(pasta, nomeMalha, superior, inferior = []) {
    const recurso = (subpasta, nome) => "/HuaShira/Characters/Hero/" + pasta + "/" + subpasta + nome + "." + nome;
    return {
        malha: recurso("", nomeMalha),
        panosCima: superior.map(nome => recurso("Cloth/", nome)),
        panosBaixo: inferior.map(nome => recurso("Cloth/", nome))
    };
}

const numerados = (prefixo, sufixo = "") => ["01", "02", "03"].map(n => prefixo + n + sufixo);
const padrao = (sufixo = "") => corpo("Hero_Hun/SkinParts", "Hun_Body_Simple",
    ["CA_Hun_UpperCloth" + sufixo, "CA_Hun_Cape" + sufixo], ["CA_Hun_Skirt" + sufixo]);

exports.modelos = {
    Changhong: corpo("Hero_Hun_ChangHong", "Hun_ChangHong_Body_Simple", numerados("CA_SM_Changhong_Hun_Cloth")),
    Fengxue: corpo("Hero_Hun_FengXueDaoke", "Hun_FengXueDaoKe_Body_Simple", numerados("CA_SM_Outfits_FengXueDaoKe_Cloth_", "_render")),
    Default: { ...padrao(), malhaTecido: "/HuaShira/Characters/Hero/Hero_Hun/SkinParts/Hun_Cloth.Hun_Cloth" },
    Sanguine: padrao("_Climax"),
    Legacy: corpo("Hero_Hun_MoTian", "Hun_MoTian_Body_Simple", numerados("CA_SM_Hun_MoTian_Cloth")),
    Zhuiming: corpo("Hero_Hun_Hook", "Hun_Hook_Body_Simple", numerados("CA_SM_Hun_Hook_cloth"))
};

function opcao(id, nome, miniatura, detalhe) {
    const imagem = "T_Icon_Appearance_" + miniatura;
    return { id, nome, detalhe, traje: "/Game/PBZContent/UI/UINew/items/" + imagem + "." + imagem };
}

exports.opcoes = [
    opcao("Changhong", "Velho Amigo", "GuYou", "Changhong"),
    opcao("Fengxue", "Vento e Neve", "FengXue", "Fengxue"),
    opcao("Default", "Traje padrão", "HeiShangTaoWang", "Roupa inicial de Soul"),
    opcao("Sanguine", "Traje sanguíneo", "HeiShangTaoZhuang", "Sanguine"),
    opcao("Legacy", "Legado", "ChuanCheng", "Mo Tian"),
    opcao("Zhuiming", "Traje de Zhuiming", "ZhuiMing")
];

exports.linhas = {
    Changhong: "HunBodyGuYou", Fengxue: "HunBodyFengXue", Default: "HunBody",
    Sanguine: "HunBodyClimax", Legacy: "HunBodyMoTian", Zhuiming: "HunBodyZhuiMing"
};
