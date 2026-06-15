$(document).ready(function() {
    cargarIssues();
});

const GITHUB_OWNER = 'rodrigomindra';
const GITHUB_REPO = 'CentralTickets';
const urlAPI = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
const GITHUB_TOKEN = ''; 

var issuesData = [];
var workflowData = [];

// Instancias de gráficos
var graficoRetrabajoInstance = null;
var graficoTiemposInstance = null;

// Control de estado de selección del Master-Detail
var issueSeleccionadoId = null;

function cargarIssues() {
    var url = `${urlAPI}/issues?state=all`;
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (GITHUB_TOKEN) { headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`; }

    $.ajax({
        url: url, method: 'GET', headers: headers, dataType: 'json',
        success: function(data) {
            data.forEach(element => {
                if (element.pull_request === undefined) { issuesData.push(element); }
            });
            cargarWorkflows();
        },
        error: function() { $('#cuerpoTablaIssues').html('<tr><td colspan="5" class="text-center text-danger">Error al cargar datos de GitHub.</td></tr>'); }
    });
}

function cargarWorkflows() {
    var url = `${urlAPI}/actions/runs`;
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (GITHUB_TOKEN) { headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`; }

    $.ajax({
        url: url, method: 'GET', headers: headers, dataType: 'json',
        success: function(data) {
            workflowData = data.workflow_runs;
            unirIssuesConWorkflows();
        }
    });
}

function unirIssuesConWorkflows() {
    let issuesDataTMP = [];
    issuesData.forEach(issue => {
        let workflowDataTMP = [];
        workflowData.forEach(workflow => {
            if (extraerIdIssue(workflow.display_title) !== null) {
                if (parseInt(extraerIdIssue(workflow.display_title)) === issue.number) {
                    workflowDataTMP.push(workflow);
                }
            }
        });
        issuesDataTMP.push({
            number: issue.number, title: issue.title, state: issue.state,
            created_at: issue.created_at, closed_at: issue.closed_at, workflow_runs: workflowDataTMP
        });
    });
    issuesData = issuesDataTMP;

    configurarEventosFiltros();
    ejecutarFiltrado(); // Renderiza la grilla y los gráficos iniciales globales
}

function extraerIdIssue(texto) {
    const regex = /#([^\s]+)/;
    const coincidencia = texto.match(regex);
    return coincidencia ? coincidencia[1] : null;
}

function configurarEventosFiltros() {
    $('#filtroEstado').on('change', () => ejecutarFiltrado());
    $('#buscadorTexto').on('input', () => ejecutarFiltrado());
    
    $('#btnLimpiarFiltros').on('click', function() {
        $('#filtroEstado').val('all'); $('#buscadorTexto').val('');
        ejecutarFiltrado();
    });

    // Acción para quitar la selección y restaurar el estado global
    $('#btnQuitarSeleccion').on('click', function() {
        issueSeleccionadoId = null;
        $(this).hide();
        $('.fila-issue').removeClass('table-primary');
        ejecutarFiltrado();
    });
}

function ejecutarFiltrado() {
    let estado = $('#filtroEstado').val();
    let texto = $('#buscadorTexto').val().toLowerCase().trim();

    let filtrados = issuesData.filter(issue => {
        let pasaEstado = (estado === 'all' || issue.state === estado);
        let pasaTexto = (texto === '' || issue.title.toLowerCase().includes(texto));
        return pasaEstado && pasaTexto;
    });

    pintarGrillaMaestra(filtrados);
    renderizarComponentesAnaliticos(filtrados);
}

function pintarGrillaMaestra(datos) {
    let html = '';
    if (datos.length === 0) {
        html = '<tr><td colspan="5" class="text-center py-3">No se encontraron registros.</td></tr>';
        $('#cuerpoTablaIssues').html(html);
        return;
    }

    datos.forEach((issue) => {
        let badgeEstado = issue.state === 'open' ? '<span class="badge bg-success">Abierto</span>' : '<span class="badge bg-danger">Cerrado</span>';
        let claseFilaSeleccionada = (issueSeleccionadoId === issue.number) ? 'table-primary' : '';
        
        html += `
            <tr class="fila-issue ${claseFilaSeleccionada}" style="cursor:pointer;" onclick="seleccionarIssueParaAnalisis(${issue.number})">
                <td><strong>#${issue.number}</strong></td>
                <td>${issue.title}</td>
                <td>${badgeEstado}</td>
                <td><span class="badge bg-secondary">${issue.workflow_runs.length} runs</span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-light border" type="button" data-bs-toggle="collapse" data-bs-target="#detalle-workflow-${issue.number}" onclick="event.stopPropagation();">
                        🔍 Ver Detalle
                    </button>
                </td>
            </tr>
            <tr class="table-light collapse" id="detalle-workflow-${issue.number}">
                <td colspan="5" class="p-3">
                    <div class="bg-white p-3 rounded border">
                        <h6 class="fw-bold text-dark mb-2">📌 Workflows Ejecutados para el Issue #${issue.number}:</h6>
                        ${generarSubTablaWorkflows(issue.workflow_runs)}
                    </div>
                </td>
            </tr>
        `;
    });
    $('#cuerpoTablaIssues').html(html);
}

function generarSubTablaWorkflows(runs) {
    if (!runs || runs.length === 0) return '<p class="text-muted mb-0">No hay ejecuciones vinculadas a este issue.</p>';
    let lineas = runs.map(run => {
        let claseBadge = run.conclusion === 'success' ? 'bg-success' : 'bg-danger';
        let duracionMin = Math.round((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000 / 60);
        return `<tr><td><code>Run #${run.run_number}</code></td><td><span class="badge ${claseBadge}">${run.conclusion || 'pending'}</span></td><td>${duracionMin} min</td><td>${new Date(run.created_at).toLocaleString()}</td></tr>`;
    }).join('');
    return `<table class="table table-sm table-bordered mt-2 mb-0" style="font-size: 0.85rem;"><thead class="table-dark"><tr><th>Número de Ejecución</th><th>Conclusión</th><th>Duración</th><th>Fecha</th></tr></thead><tbody>${lineas}</tbody></table>`;
}

function seleccionarIssueParaAnalisis(numeroIssue) {
    issueSeleccionadoId = numeroIssue;
    $('#btnQuitarSeleccion').show();
    ejecutarFiltrado(); // Volvemos a procesar bajo el contexto de selección
}

// MOTOR CENTRAL DE CÁLCULO Y RENDERIZADO GRÁFICO (Doble comportamiento)
function renderizarComponentesAnaliticos(datosFiltrados) {
    // 1. CÁLCULO ESTRICTO DE KPIS CON EL 100% DE LOS ISSUES FILTRADOS
    let acumuladoHorasCiclo = 0;
    let totalMinutosCI = 0;
    let totalIssuesConTiempo = 0;

    datosFiltrados.forEach(issue => {
        let start = new Date(issue.created_at);
        let end = issue.closed_at ? new Date(issue.closed_at) : new Date();
        acumuladoHorasCiclo += (end - start) / (1000 * 60 * 60);
        totalIssuesConTiempo++;

        issue.workflow_runs.forEach(run => {
            totalMinutosCI += Math.round((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000 / 60);
        });
    });

    let promedioHoras = totalIssuesConTiempo > 0 ? Math.round((acumuladoHorasCiclo / totalIssuesConTiempo) * 10) / 10 : 0;
    
    // Inyectamos textos base de KPIs
    $('#kpiTiempoCI').text(`${promedioHoras} hrs`);
    $('#kpiPromedioRun').text(`${totalMinutosCI} min`);

    // Variables locales para el dibujo de gráficos
    let labelsGrafico = [];
    let datasetDatos1 = [];
    let datasetDatos2 = [];
    let titulosTooltips = [];

    let configuracionGrafico1 = {};
    let configuracionGrafico2 = {};

    // 2. DETERMINAR COMPORTAMIENTO SEGÚN SELECCIÓN
    if (issueSeleccionadoId === null) {
        // --- VISTA GLOBAL: TOP 10 ISSUES ---
        $('#labelKpiTiempo').text("Tiempo de Ciclo Promedio");
        $('#labelKpiEsfuerzo').text("Esfuerzo Total de Automatización");
        $('#subtextTiempoCiclo').text("Calculado en base a todos los registros");
        $('#subtextEsfuerzo').text("Tiempo total de CI acumulado por el repositorio");
        $('#tituloGrafico1').html("🔄 Índice de Re-trabajo <span class=\"badge bg-secondary\">Top 10</span>");
        $('#tituloGrafico2').html("⏱️ Lead Time de Resolución <span class=\"badge bg-secondary\">Top 10</span>");

        // Limitamos a un máximo de 10 elementos cronológicos para los gráficos
        let top10Issues = datosFiltrados.slice().reverse().slice(0, 10);

        top10Issues.forEach(issue => {
            labelsGrafico.push(`Issue #${issue.number}`);
            titulosTooltips.push(issue.title);
            datasetDatos1.push(issue.workflow_runs.length);

            let start = new Date(issue.created_at);
            let end = issue.closed_at ? new Date(issue.closed_at) : new Date();
            datasetDatos2.push(Math.round(((end - start) / (1000 * 60 * 60)) * 10) / 10);
        });

        // Configuración estructural global
        configuracionGrafico1 = {
            type: 'bar',
            data: {
                labels: labelsGrafico,
                datasets: [{ label: 'Cantidad de Workflow Runs', data: datasetDatos1, backgroundColor: 'rgba(13, 110, 253, 0.6)', borderColor: '#0d6efd', borderWidth: 1 }]
            },
            options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { tooltip: { callbacks: { title: (ctx) => `${labelsGrafico[ctx[0].dataIndex]}: ${titulosTooltips[ctx[0].dataIndex]}` } } } }
        };

        configuracionGrafico2 = {
            type: 'line',
            data: {
                labels: labelsGrafico,
                datasets: [{ label: 'Horas Transcurridas', data: datasetDatos2, borderColor: '#198754', backgroundColor: 'rgba(25, 135, 84, 0.1)', fill: true, tension: 0.2 }]
            },
            options: { scales: { y: { beginAtZero: true } }, plugins: { tooltip: { callbacks: { title: (ctx) => `${labelsGrafico[ctx[0].dataIndex]}: ${titulosTooltips[ctx[0].dataIndex]}` } } } }
        };

    } else {
        // --- VISTA DETALLE: SINGLE ISSUE INDIVIDUAL ---
        let issueTarget = issuesData.find(i => i.number === issueSeleccionadoId);
        if (!issueTarget) return;

        $('#labelKpiTiempo').text(`Tiempo de Ciclo: Issue #${issueTarget.number}`);
        $('#labelKpiEsfuerzo').text(`Esfuerzo en CI: Issue #${issueTarget.number}`);
        $('#subtextTiempoCiclo').text(issueTarget.closed_at ? 'Tiempo total que tomó cerrarlo' : 'Tiempo acumulado abierto actualmente');
        
        let minutosIndividualesCI = 0;
        issueTarget.workflow_runs.forEach(r => minutosIndividualesCI += Math.round((new Date(r.updated_at) - new Date(r.run_started_at)) / 1000 / 60));
        $('#kpiPromedioRun').text(`${minutosIndividualesCI} min`);
        $('#subtextEsfuerzo').text("Suma de la duración de todas sus corridas individuales");

        $('#tituloGrafico1').html(`⏱️ Duración de Runs Individuales <span class="badge bg-primary">Issue #${issueTarget.number}</span>`);
        $('#tituloGrafico2').html(`📈 Historial de Estabilidad <span class="badge bg-primary">Issue #${issueTarget.number}</span>`);

        // Recorremos los runs cronológicamente
        issueTarget.workflow_runs.slice().reverse().forEach(run => {
            labelsGrafico.push(`Run #${run.run_number}`);
            let minRun = Math.round((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000 / 60);
            datasetDatos1.push(minRun);
            datasetDatos2.push(run.conclusion === 'success' ? 1 : 0);
        });

        configuracionGrafico1 = {
            type: 'bar',
            data: {
                labels: labelsGrafico,
                datasets: [{ label: 'Duración (Minutos)', data: datasetDatos1, backgroundColor: 'rgba(13, 110, 253, 0.6)', borderColor: '#0d6efd', borderWidth: 1 }]
            },
            options: { scales: { y: { beginAtZero: true, title: { display: true, text: 'Minutos' } } } }
        };

        configuracionGrafico2 = {
            type: 'line',
            data: {
                labels: labelsGrafico,
                datasets: [{ label: 'Estado (1=Éxito, 0=Fallo)', data: datasetDatos2, borderColor: '#198754', backgroundColor: 'rgba(25, 135, 84, 0.1)', stepped: true, tension: 0 }]
            },
            options: { scales: { y: { min: 0, max: 1, ticks: { callback: (val) => val === 1 ? 'SUCCESS' : 'FAILURE' } } } }
        };
    }

    // 3. INYECTAR EN LOS CANVASES DE MANERA SEGURA
    if (graficoRetrabajoInstance) { graficoRetrabajoInstance.destroy(); }
    graficoRetrabajoInstance = new Chart($('#canvasRetrabajo'), configuracionGrafico1);

    if (graficoTiemposInstance) { graficoTiemposInstance.destroy(); }
    graficoTiemposInstance = new Chart($('#canvasTiemposCiclo'), configuracionGrafico2);
}