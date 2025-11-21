// ==========================================
// app.js - Core Logic (Refactored & Zero-Bug)
// ==========================================

const STORAGE_KEY = "simulador_lucro_config_v1";
const MAX_EXTRAS = 30;

// Referências Globais de Estado
let chartInstance = null;
let chartExtrasInstance = null;
let simulationTimerId = null; // Controla o loop para evitar sobreposição
let isRunning = false;

// =======================
// Inicialização e Eventos
// =======================

document.addEventListener("DOMContentLoaded", () => {
    loadConfig(); // Carrega dados salvos
    setupInputs();
});

document.getElementById("start").onclick = startSimulation;
document.getElementById("reset").onclick = resetSimulation;
document.getElementById("btnExport").onclick = exportTableToCSV;

// =======================
// Máscaras e Inputs
// =======================

function setupInputs() {
    document.querySelectorAll(".money").forEach(input => {
        input.addEventListener("input", e => {
            e.target.value = formatMoney(e.target.value);
            saveConfig(); // Auto-save
        });
    });

    document.querySelectorAll(".percent").forEach(input => {
        input.addEventListener("input", e => {
            e.target.value = formatPercent(e.target.value);
            saveConfig(); // Auto-save
        });
    });
}

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

function parseMoney(v) {
    if (!v) return 0;
    return Number(String(v).replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
}

function parsePercent(v) {
    if (!v) return 0;
    return Number(String(v).replace("%", "").trim()) / 100;
}

// =======================
// Persistência (LocalStorage)
// =======================

function saveConfig() {
    const config = {
        investimento: document.getElementById("investimento").value,
        target: document.getElementById("target").value,
        variacao: document.getElementById("variacao").value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function loadConfig() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const config = JSON.parse(saved);
            if(config.investimento) document.getElementById("investimento").value = config.investimento;
            if(config.target) document.getElementById("target").value = config.target;
            if(config.variacao) document.getElementById("variacao").value = config.variacao;
        } catch (e) {
            console.error("Erro ao carregar config", e);
        }
    }
}

// =======================
// Lógica de Simulação
// =======================

function startSimulation() {
    // 1. Validação
    const investimento = parseMoney(document.getElementById("investimento").value);
    const custo = parseMoney(document.getElementById("custo").value);
    const ganho = parseMoney(document.getElementById("ganho").value);
    const target = parseMoney(document.getElementById("target").value);
    const variacao = parsePercent(document.getElementById("variacao").value);

    const lucroUnit = ganho - custo;
    if (lucroUnit <= 0) {
        alert("Erro Crítico: Ganho unitário deve ser maior que custo unitário.");
        return;
    }

    const unidadesMin = Math.ceil((120 + 2 * custo) / lucroUnit);
    const investimentoMin = unidadesMin * custo;

    const warnEl = document.getElementById("warn");
    if (investimento < investimentoMin) {
        document.getElementById("warn-val").textContent = "R$ " + investimentoMin.toLocaleString('pt-BR', {minimumFractionDigits:2});
        warnEl.classList.remove("hidden");
        return;
    } else {
        warnEl.classList.add("hidden");
    }

    // 2. Prepara UI
    saveConfig();
    document.getElementById("start").disabled = true; // Evita duplo clique
    document.getElementById("sim-screen").classList.remove("hidden");
    
    // Scroll suave para resultados (mobile UX)
    if(window.innerWidth < 900) {
        document.getElementById("sim-screen").scrollIntoView({behavior: "smooth"});
    }

    // 3. Limpa estado anterior
    stopLoop(); 
    clearOutputs();

    // 4. Inicia Loop
    runSimulationLoop(investimento, custo, ganho, target, variacao);
}

function resetSimulation() {
    stopLoop();
    
    // Esconde painel de resultados
    document.getElementById("sim-screen").classList.add("hidden");
    document.getElementById("start").disabled = false;
    
    // Opcional: Limpar os campos visuais imediatamente ou manter o último estado?
    // Mantemos os inputs, limpamos apenas os outputs internos.
    clearOutputs();
}

function stopLoop() {
    isRunning = false;
    if (simulationTimerId) {
        clearTimeout(simulationTimerId);
        simulationTimerId = null;
    }
}

function clearOutputs() {
    document.getElementById("analyticBody").innerHTML = "";
    document.getElementById("log").innerHTML = "";
    document.getElementById("progress-fill").style.width = "0%";
    document.getElementById("progress-text").textContent = "0%";
    
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    if (chartExtrasInstance) {
        chartExtrasInstance.destroy();
        chartExtrasInstance = null;
    }
}

// =======================
// Core Loop
// =======================

function runSimulationLoop(investInicial, custo, ganho, target, variacao) {
    isRunning = true;
    
    // Dados para Gráficos
    const dataLabels = [];
    const dataLucroBruto = [];
    const dataLucroLiquido = [];
    const dataIncremento = [];
    const dataExtras = [];

    let mes = 0;
    let investimentoAtual = investInicial;
    let ganhoLiquidoAcumulado = 0;

    // Inicializa Gráficos Vazios
    initCharts();

    function step() {
        if (!isRunning) return; // Safety check

        mes++;

        // Variação aleatória
        let ganhoAjustado = ganho;
        if (variacao > 0) {
            // Ex: 0.5% -> random entre -0.5% e +0.5%
            let f = (Math.random() * variacao * 2) - variacao;
            ganhoAjustado *= (1 + f);
        }

        // Lógica de Negócio
        const unidades = Math.floor(investimentoAtual / custo);
        const bruto = unidades * ganhoAjustado;
        const liquido = unidades * (ganhoAjustado - custo);

        ganhoLiquidoAcumulado += liquido;

        // Cálculo Extras
        let unidadesExtras = Math.floor(unidades / 10);
        if (unidadesExtras < 1) unidadesExtras = 1;
        if (unidadesExtras > MAX_EXTRAS) unidadesExtras = MAX_EXTRAS;

        // Atualiza Dados
        dataLabels.push("Mês " + mes);
        dataLucroBruto.push(bruto);
        dataLucroLiquido.push(liquido);
        dataIncremento.push(custo * unidadesExtras);
        dataExtras.push(unidadesExtras);

        // Atualiza UI
        updateCharts(dataLabels, dataLucroBruto, dataLucroLiquido, dataIncremento, dataExtras);
        updateLog(mes, unidades, unidadesExtras, investimentoAtual, bruto, liquido, ganhoLiquidoAcumulado);
        updateTable(mes, unidades, unidadesExtras, investimentoAtual, bruto, liquido, ganhoLiquidoAcumulado);
        updateProgressBar(liquido, target);

        // Prepara Próximo Mês
        investimentoAtual += custo * unidadesExtras;

        // Verifica Meta
        if (liquido >= target) {
            logSuccess(mes, liquido, ganhoLiquidoAcumulado);
            isRunning = false; // Fim
            document.getElementById("start").disabled = false;
        } else {
            // Próximo passo
            simulationTimerId = setTimeout(step, 400); // 400ms delay para animação
        }
    }

    step();
}

// =======================
// UI Updates & Charts
// =======================

function updateProgressBar(currentLiq, target) {
    let pct = (currentLiq / target) * 100;
    if (pct > 100) pct = 100;
    if (pct < 0) pct = 0;
    
    const fill = document.getElementById("progress-fill");
    const text = document.getElementById("progress-text");
    
    fill.style.width = pct.toFixed(1) + "%";
    text.textContent = pct.toFixed(1) + "%";
}

function updateTable(mes, un, extra, inv, bru, liq, acum) {
    const tbody = document.getElementById("analyticBody");
    const tr = document.createElement("tr");
    
    // Formatadores rápidos
    const m = val => val.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

    tr.innerHTML = `
        <td>${mes}</td>
        <td class="text-right">${un}</td>
        <td class="text-right">${extra}</td>
        <td class="text-right">${m(inv)}</td>
        <td class="text-right">${m(bru)}</td>
        <td class="text-right" style="color:#facc15">${m(liq)}</td>
        <td class="text-right">${m(acum)}</td>
    `;
    
    // Inserir no topo (Prepend)
    if (tbody.firstChild) tbody.insertBefore(tr, tbody.firstChild);
    else tbody.appendChild(tr);
}

function updateLog(mes, un, extra, inv, bru, liq, acum) {
    const logBox = document.getElementById("log");
    const m = val => val.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    
    const html = `
        <div class="log-item">
            <strong>Mês ${mes}</strong> | Unidades: ${un} (+${extra})<br>
            <span style="color:#8b949e">Inv: ${m(inv)}</span><br>
            L. Líquido: <strong style="color:#facc15">${m(liq)}</strong>
        </div>
    `;
    logBox.innerHTML = html + logBox.innerHTML;
}

function logSuccess(mes, liq, acum) {
    const logBox = document.getElementById("log");
    const m = val => val.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    
    const html = `
        <div class="log-item log-success">
            <strong>🚀 META ATINGIDA (Mês ${mes})</strong><br>
            Renda Mensal: ${m(liq)}<br>
            Acumulado Total: ${m(acum)}
        </div>
    `;
    logBox.innerHTML = html + logBox.innerHTML;
}

function initCharts() {
    const ctx = document.getElementById("chart");
    const ctxE = document.getElementById("chartExtras");

    Chart.defaults.color = '#8b949e';
    Chart.defaults.borderColor = '#30363d';

    chartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                { label: "Lucro Líquido", data: [], borderColor: "#facc15", backgroundColor: "rgba(250, 204, 21, 0.1)", borderWidth: 2, tension: 0.3, fill: true },
                { label: "Lucro Bruto", data: [], borderColor: "#4ade80", borderWidth: 2, tension: 0.3, hidden: true } // Oculto por padrão para limpar a view
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // Performance no update loop
            plugins: { legend: { position: 'top' } },
            scales: { y: { beginAtZero: true } }
        }
    });

    chartExtrasInstance = new Chart(ctxE, {
        type: "bar", // Mudado para Barra para visualizar melhor a quantidade discreta
        data: {
            labels: [],
            datasets: [
                { label: "Novas Unidades (Extras)", data: [], backgroundColor: "#a371f7" }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

function updateCharts(labels, bruto, liquido, inc, extras) {
    if(!chartInstance || !chartExtrasInstance) return;

    // Update Main Chart
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = liquido;
    chartInstance.data.datasets[1].data = bruto;
    chartInstance.update('none'); // Mode 'none' para performance sem animação pesada a cada frame

    // Update Extras Chart
    chartExtrasInstance.data.labels = labels;
    chartExtrasInstance.data.datasets[0].data = extras;
    chartExtrasInstance.update('none');
}

// =======================
// Export CSV
// =======================

function exportTableToCSV() {
    const table = document.getElementById("analyticTableInner");
    if (!table) return;

    let csv = [];
    const rows = table.querySelectorAll("tr");

    for (let i = 0; i < rows.length; i++) {
        const row = [], cols = rows[i].querySelectorAll("td, th");
        for (let j = 0; j < cols.length; j++) {
            // Limpa texto para CSV (remove R$, pontos de milhar, etc se quiser raw, aqui mantemos formato texto)
            let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, "").replace(/;/g, ",");
            row.push(data);
        }
        csv.push(row.join(";")); // Ponto e vírgula para Excel BR
    }

    const csvFile = new Blob([csv.join("\n")], { type: "text/csv" });
    const downloadLink = document.createElement("a");
    downloadLink.download = "simulacao_lucro.csv";
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}
