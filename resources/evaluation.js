const source = "https://raw.githubusercontent.com/philipgerlee/swedish_forecasting_hub/dashboard-data/probabilistic-comparison-by-location-horizon.csv";
const language = location.pathname.endsWith("-en.html") ? "en" : "sv";
const copy = language === "en" ? {
  locale: "en-GB",
  locations: { SE: "Sweden", "SE-M": "Skåne Region", "SE-O": "Västra Götaland Region" },
  headers: ["Location", "Horizon", "n", "QRA WIS", "Baseline WIS", "WIS skill"],
  updated: "Last updated from frozen outcome data",
  error: "The results table could not be loaded. Please use the link to the results file below."
} : {
  locale: "sv-SE",
  locations: { SE: "Sverige", "SE-M": "Region Skåne", "SE-O": "Västra Götalandsregionen" },
  headers: ["Plats", "Horisont", "n", "QRA WIS", "Baseline WIS", "WIS-färdighet"],
  updated: "Senast uppdaterad från fryst utfallsdata",
  error: "Resultattabellen kunde inte läsas in. Använd länken till resultatfilen nedan."
};

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
}

function number(value, digits = 1) {
  return new Intl.NumberFormat(copy.locale, { maximumFractionDigits: digits }).format(Number(value));
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
      return `<tr><td>${copy.locations[row.location] || row.location_name}</td><td>${row.horizon}</td><td>${row.n}</td><td>${number(row.mean_qra_wis)}</td><td>${number(row.mean_baseline_wis)}</td><td class="${klass}">${number(skill * 100)} %</td></tr>`;
    }).join("");
    root.className = "evaluation-table";
    root.innerHTML = `<table><thead><tr>${copy.headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
    status.textContent = `${copy.updated}: ${rows[0].outcome_data_version.slice(0, 10)}.`;
  } catch (error) {
    status.textContent = copy.error;
    console.error(error);
  }
}

renderEvaluation();
