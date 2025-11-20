// =======================
// app.js - Simulador com extras, limite e tabela analítica
// =======================

// =======================
// Máscaras
// =======================
function formatMoney(value) {
    let v = String(value).replace(/\D/g, "");
    if (v === "") return "";
    v = (v / 100).toFixed(2) + "";
    v = v.replace(".", ",");
    return "R$ " + v.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatPercent(value) {
    let v = String(value).replace(/\D/g, "");
    if (v === "") return "";
    if (v.length > 3) v = v.slice(0, 3);
    return v + "%";
}

document.querySelectorAll(".money").forEach(input => {
    input.addEventListener("input", e => {
        // mantém o cursor no final — simples e funcional
        e.target.value = formatMoney(e.target.value);
    });
});

document.querySelectorAll(".percent").forEach(input => {
    input.addEventListener("input", e => {
        e.target.value = formatPercent(e.target.value);
    });
});

// =======================
// Utils
// =======================
function parseMoney(v) {
    if (!v) return 0;
    return Number(String(v).replace("R$", "").replace(/\./g, "").replace(",", "."));
}

function parsePercent(v) {
    if (!v) return 0;
    return Number(String(v).replace("%", "")) / 100;
}

function createIfMissingExtrasCanvas() {
    // cria canvas extras se não existir
    if (!document.getElementById("chartExtras")) {
        const chart = document.getElementById("chart");
        const wrapper = chart.parentNode;
        const c = document.createElement("canvas");
        c.id = "chartExtras";
        c.height = 140;
        c.style.marginTop = "16px";
        wrapper.appendChild(c);
    }
}

function createIfMissingTable() {
    // cria tabela analítica se não existir
    if (!document.getElementById("analyticTable")) {
        const simScreen = document.getElementById("sim-screen") || document.body;
        const div = document.createElement("div");
        div.id = "analyticTable";
        div.style.marginTop = "16px";
        div.style.overflowX = "auto";
        div.innerHTML = `
            <h3 style="margin:8px 0;">Tabela Analítica</h3>
            <table id="analyticTableInner" style="width:100%; border-collapse:collapse; font-size:10px;">
                <thead>
                    <tr>
                        <th style="text-align:left; padding:6px; border-bottom:1px solid #333;">Mês</th>
                        <th style="text-align:right; padding:6px; border-bottom:1px solid #333;">Unidades</th>
                        <th style="text-align:right; padding:6px; border-bottom:1px solid #333;">Extras</th>
                        <th style="text-align:right; padding:6px; border-bottom:1px solid #333;">Investimento</th>
                        <th style="text-align:right; padding:6px; border-bottom:1px solid #333;">Lucro Bruto</th>
                        <th style="text-align:right; padding:6px; border-bottom:1px solid #333;">Lucro Líquido</th>
                        <th style="text-align:right; padding:6px; border-bottom:1px solid #333;">Acumulado</th>
                    </tr>
                </thead>
                <tbody id="analyticBody"></tbody>
            </table>
        `;
        // insere antes do log para ficar paralela
        const log = document.getElementById("log");
        if (log && log.parentNode) {
            log.parentNode.insertBefore(div, log);
        } else {
            simScreen.appendChild(div);
        }
    }
}

// =======================
// Simulação
// =======================

let chart;          // gráfico principal
let chartExtras;    // gráfico de extras
const MAX_EXTRAS = 30; // limite máximo de extras pedido (30)

document.getElementById("start").onclick = () => {

    const investimento = parseMoney(document.getElementById("investimento").value);
    const custo = parseMoney(document.getElementById("custo").value);
    const ganho = parseMoney(document.getElementById("ganho").value);
    const target = parseMoney(document.getElementById("target").value);
    const variacao = parsePercent(document.getElementById("variacao").value);

    // regra do investimento mínimo (fórmula confirmada)
    const lucroUnit = ganho - custo;
    if (lucroUnit <= 0) {
        alert("Ganho unitário deve ser maior que custo unitário.");
        return;
    }
    const unidadesMin = Math.ceil((120 + 2 * custo) / lucroUnit);
    const investimentoMin = unidadesMin * custo;

    if (investimento < investimentoMin) {
        document.getElementById("warn").classList.remove("hidden");
        return;
    } else {
        document.getElementById("warn").classList.add("hidden");
    }

    document.getElementById("param-screen").classList.add("hidden");
    document.getElementById("sim-screen").classList.remove("hidden");

    // garante elementos extras
    createIfMissingExtrasCanvas();
    createIfMissingTable();

    iniciarSimulacao(investimento, custo, ganho, target, variacao);
};

document.getElementById("reset").onclick = () => {
    location.reload();
};


function iniciarSimulacao(investInicial, custo, ganho, target, variacao) {

    // reset (caso rode várias vezes)
    const labels = [];
    const lucroBruto = [];
    const incrementos = [];
    const lucroLiquido = [];
    const extrasData = []; // para chartExtras
    const analBody = document.getElementById("analyticBody");
    if (analBody) analBody.innerHTML = "";
    const logBox = document.getElementById("log");
    if (logBox) logBox.innerHTML = "";

    let mes = 0;
    let investimentoAtual = investInicial;
    let ganhoLiquidoAcumulado = 0;

    // gráfico principal
    const ctx = document.getElementById("chart");
    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                { label: "Lucro Bruto", data: lucroBruto, borderWidth: 2, borderColor: "#4ade80", tension:0.25 },
                { label: "Incremento (R$)", data: incrementos, borderWidth: 2, borderColor: "#3b82f6", tension:0.25 },
                { label: "Lucro Líquido", data: lucroLiquido, borderWidth: 2, borderColor: "#facc15", tension:0.25 }
            ]
        },
        options: {
            animation: { duration: 450 },
            plugins: { legend: { labels: { color: '#fff' } } },
            scales: {
                x: { ticks: { color: '#ddd' } },
                y: { ticks: { color: '#ddd' } }
            }
        }
    });

    // gráfico de extras
    const ctxE = document.getElementById("chartExtras");
    chartExtras = new Chart(ctxE, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                { label: "Unidades Extras por Mês", data: extrasData, borderWidth: 2, borderColor: "#ec4899", tension:0.25, fill:false }
            ]
        },
        options: {
            animation: { duration: 450 },
            plugins: { legend: { labels: { color: '#fff' } } },
            scales: {
                x: { ticks: { color: '#ddd' } },
                y: { ticks: { color: '#ddd' }, beginAtZero: true }
            }
        }
    });

    function ciclo() {
        mes++;

        // possível variação do ganho
        let ganhoAjustado = ganho;
        if (variacao > 0) {
            let f = (Math.random() * variacao * 2) - variacao;
            ganhoAjustado *= (1 + f);
        }

        // unidades possíveis
        const unidades = Math.floor(investimentoAtual / custo);

        // cálculo dos lucros
        const bruto = unidades * ganhoAjustado;
        const liquido = unidades * (ganhoAjustado - custo);

        ganhoLiquidoAcumulado += liquido;

        // extras: regra linear solicitada: floor(unidades / 10), mínimo 1, com limite máximo
        let unidadesExtras = Math.floor(unidades / 10);
        if (unidadesExtras < 1) unidadesExtras = 1;
        if (unidadesExtras > MAX_EXTRAS) unidadesExtras = MAX_EXTRAS;

        // registro para gráficos e tabela
        labels.push("Mês " + mes);
        lucroBruto.push(Number(bruto.toFixed(2)));
        incrementos.push(Number((custo * unidadesExtras).toFixed(2))); // incremento em R$
        lucroLiquido.push(Number(liquido.toFixed(2)));

        // atualiza gráfico principal
        chart.update();

        // atualiza gráfico de extras
        chartExtras.data.labels.push("Mês " + mes);
        chartExtras.data.datasets[0].data.push(unidadesExtras);
        chartExtras.update();

        // log (prepend - último primeiro)
        if (logBox) {
            const rowHtml = `
<div class="log-item">
    <b>Mês ${mes}</b><br>
    Unidades: ${unidades}<br>
    Extras: ${unidadesExtras}<br>
    Investimento: R$ ${investimentoAtual.toFixed(2)}<br>
    Lucro Bruto: R$ ${bruto.toFixed(2)}<br>
    Lucro Líquido: R$ ${liquido.toFixed(2)}<br>
    <b>Acumulado: R$ ${ganhoLiquidoAcumulado.toFixed(2)}</b>
</div>
`;
            logBox.innerHTML = rowHtml + logBox.innerHTML;
        }

        // tabela analítica (append no topo para ficar sincronizada com log)
        if (analBody) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding:6px; border-bottom:1px solid #222;">Mês ${mes}</td>
                <td style="padding:6px; text-align:right; border-bottom:1px solid #222;">${unidades}</td>
                <td style="padding:6px; text-align:right; border-bottom:1px solid #222;">${unidadesExtras}</td>
                <td style="padding:6px; text-align:right; border-bottom:1px solid #222;">R$ ${investimentoAtual.toFixed(2)}</td>
                <td style="padding:6px; text-align:right; border-bottom:1px solid #222;">R$ ${bruto.toFixed(2)}</td>
                <td style="padding:6px; text-align:right; border-bottom:1px solid #222;">R$ ${liquido.toFixed(2)}</td>
                <td style="padding:6px; text-align:right; border-bottom:1px solid #222;">R$ ${ganhoLiquidoAcumulado.toFixed(2)}</td>
            `;
            // insere no topo da tabela
            if (analBody.firstChild) analBody.insertBefore(tr, analBody.firstChild);
            else analBody.appendChild(tr);
        }

        // aplica incremento no investimento atual: adiciona custo * unidadesExtras
        investimentoAtual += custo * unidadesExtras;

        // continua simulação enquanto lucro líquido < target
        if (liquido < target) {
            setTimeout(ciclo, 500);
        } else {
            // alcançou target — adiciona linha final no log/tabela destacando
            if (logBox) {
                const doneHtml = `
<div class="log-item" style="border-left:4px solid #22c55e; background:#0f1724;">
    <b>Meta atingida no mês ${mes}</b><br>
    Lucro Líquido: R$ ${liquido.toFixed(2)}<br>
    Acumulado: R$ ${ganhoLiquidoAcumulado.toFixed(2)}
</div>
`;
                logBox.innerHTML = doneHtml + logBox.innerHTML;
            }
        }
    }

    // start
    ciclo();
}