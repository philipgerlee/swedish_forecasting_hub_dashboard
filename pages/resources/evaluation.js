const source = "https://raw.githubusercontent.com/philipgerlee/swedish_forecasting_hub/main/evaluation-output/2025-2026/probabilistic-comparison-by-location-horizon.csv";

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
}

function number(value, digits = 1) {
  return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: digits }).format(Number(value));
}

async function renderEvaluation() {
  const status = document.querySelector("#evaluation-status");
  const root = document.querySelector("#evaluation-table");
  if (!status || !root) return;
  try {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = parseCsv(await response.text());
    const body = rows.map((row) => {
      const skill = Number(row.wis_skill);
      const klass = skill >= 0 ? "skill-positive" : "skill-negative";
      return `<tr><td>${row.location_name}</td><td>${row.horizon}</td><td>${row.n}</td><td>${number(row.mean_qra_wis)}</td><td>${number(row.mean_baseline_wis)}</td><td class="${klass}">${number(skill * 100)} %</td></tr>`;
    }).join("");
    root.className = "evaluation-table";
    root.innerHTML = `<table><thead><tr><th>Plats</th><th>Horisont</th><th>n</th><th>QRA WIS</th><th>Baseline WIS</th><th>WIS-färdighet</th></tr></thead><tbody>${body}</tbody></table>`;
    status.textContent = `Senast uppdaterad från fryst utfallsdata: ${rows[0].outcome_data_version.slice(0, 10)}.`;
  } catch (error) {
    status.textContent = "Resultattabellen kunde inte läsas in. Använd länken till resultatfilen nedan.";
    console.error(error);
  }
}

renderEvaluation();
