$(document).ready(function() {
    cargarIssues();
});

const GITHUB_OWNER = 'rodrigomindra';
const GITHUB_REPO = 'CentralTickets';
const urlAPI = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
const GITHUB_TOKEN = ''; // Agrega tu PAT aquí si el repo pasa a privado

var issuesData = [];
var workflowData = [];

function cargarIssues() {
    var url = `${urlAPI}/issues?state=all`;
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (GITHUB_TOKEN) { headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`; }

    $.ajax({
        url: url,
        method: 'GET',
        headers: headers,
        dataType: 'json',
        success: function(data) {
            data.forEach(element => {
                if (element.pull_request === undefined) {
                    issuesData.push(element);
                }
            });
            cargarWorkflows();
        },
        error: function(xhr, status, error) {
            console.error("Error al consultar la API de GitHub:", error);
        }
    });
}

function cargarWorkflows() {
    var url = `${urlAPI}/actions/runs`;
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (GITHUB_TOKEN) { headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`; }

    $.ajax({
        url: url,
        method: 'GET',
        headers: headers,
        dataType: 'json',
        success: function(data) {
            workflowData = data.workflow_runs;
            unirIssuesConWorkflows();
        },
        error: function(xhr, status, error) {
            console.error("Error al consultar la API de GitHub:", error);
        }
    });
}

function unirIssuesConWorkflows() {
    let issuesDataTMP = [];

    issuesData.forEach(issue => {
        let workflowDataTMP = [];
        workflowData.forEach(workflow => {
            try {
                if (extraerIdIssue(workflow.display_title) !== null) {
                    let idIssue = parseInt(extraerIdIssue(workflow.display_title));
                    if (idIssue === issue.number) {
                        workflowDataTMP.push(workflow);
                    }
                }
            } catch (error) {
                console.error("Error al extraer el número de issue del título del workflow:", error);
            }
        });
        
        let objIssue = {
            body: issue.body,
            closed_at: issue.closed_at,
            comments: issue.comments,
            comments_url: issue.comments_url,
            created_at: issue.created_at,
            html_url: issue.html_url,
            id: issue.id,
            number: issue.number,
            state: issue.state,
            state_reason: issue.state_reason,
            title: issue.title,
            workflow_runs: workflowDataTMP
        }
        issuesDataTMP.push(objIssue);
    });
    issuesData = issuesDataTMP;

    // ALERTA: Una vez mapeados, disparamos el procesado analítico de gráficos
    procesarYRenderizarGraficos();
}

function extraerIdIssue(texto) {
    const regex = /#([^\s]+)/;
    const coincidencia = texto.match(regex);
    return coincidencia ? coincidencia[1] : null;
}

// ==========================================
// NUEVA FUNCIÓN: PROCESAMIENTO Y GRÁFICOS
// ==========================================
function procesarYRenderizarGraficos() {
    // Arrays colectores para Chart.js
    let labelsIssues = [];
    let conteoRuns = [];
    let tiempoAbiertoHoras = [];
    let titulosCompletosIssues = [];

    // Variables para acumular tiempos de CI (Métrica 4)
    let tiempoTotalCIMilisegundos = 0;
    let totalRunsContados = 0;

    // Procesamos de atrás hacia adelante para ver orden cronológico clásico
    issuesData.slice().reverse().forEach(issue => {
        labelsIssues.push(`Issue #${issue.number}`);
        titulosCompletosIssues.push(issue.title);
        
        // [Métrica 1]: Cantidad de workflows disparados por esta issue
        conteoRuns.push(issue.workflow_runs.length);

        // [Métrica 2]: Cálculo de Lead Time (Si está cerrado calculamos total, si está abierto, calculamos al día de hoy)
        let fechaInicio = new Date(issue.created_at);
        let fechaFin = issue.closed_at ? new Date(issue.closed_at) : new Date();
        let diferenciaHoras = (fechaFin - fechaInicio) / (1000 * 60 * 60);
        tiempoAbiertoHoras.push(Math.round(diferenciaHoras * 10) / 10); // Redondeo a 1 decimal

        // [Métrica 4]: Sumar la duración interna de todos sus workflows de automatización
        issue.workflow_runs.forEach(run => {
            let runInicio = new Date(run.run_started_at);
            let runFin = new Date(run.updated_at);
            tiempoTotalCIMilisegundos += (runFin - runInicio);
            totalRunsContados++;
        });
    });

    // Cálculos e inyección de datos en elementos KPI de Bootstrap
    let minutosTotalesCI = Math.round(tiempoTotalCIMilisegundos / 1000 / 60);
    let promedioRunCI = totalRunsContados > 0 ? Math.round((minutosTotalesCI / totalRunsContados) * 10) / 10 : 0;

    $('#kpiTiempoCI').text(`${minutosTotalesCI} min`);
    $('#kpiPromedioRun').text(`${promedioRunCI} min`);

    // --- Renderizado de Gráficos con Chart.js ---

    // --- Gráfico de Barras: Métrica 1 (Re-trabajo) ---
    new Chart($('#canvasRetrabajo'), {
        type: 'bar',
        data: {
            labels: labelsIssues,
            datasets: [{
                label: 'Cantidad de Workflow Runs',
                data: conteoRuns,
                backgroundColor: 'rgba(13, 110, 253, 0.6)',
                borderColor: '#0d6efd',
                borderWidth: 1
            }]
        },
        options: {
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            plugins: {
                tooltip: {
                    callbacks: {
                        // Modificamos el título principal del Tooltip
                        title: function(context) {
                            // context[0].dataIndex nos da la posición (0, 1, 2...) de la barra donde está el cursor
                            let index = context[0].dataIndex;
                            let numeroIssue = labelsIssues[index]; // "Issue #12"
                            let tituloReal = titulosCompletosIssues[index]; // "Fix login bug"
                            
                            return `${numeroIssue}: ${tituloReal}`;
                        }
                    }
                }
            }
        }
    });

    // --- Gráfico de Líneas: Métrica 2 (Tiempos de Ciclo) ---
    new Chart($('#canvasTiemposCiclo'), {
        type: 'line',
        data: {
            labels: labelsIssues,
            datasets: [{
                label: 'Horas Transcurridas',
                data: tiempoAbiertoHoras,
                borderColor: '#198754',
                backgroundColor: 'rgba(25, 135, 84, 0.1)',
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            scales: { y: { beginAtZero: true } },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            let index = context[0].dataIndex;
                            return `${labelsIssues[index]}: ${titulosCompletosIssues[index]}`;
                        }
                    }
                }
            }
        }
    });
}