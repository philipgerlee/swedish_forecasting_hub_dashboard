const DATA_SOURCE = "https://raw.githubusercontent.com/philipgerlee/swedish_forecasting_hub/main/evaluation-output/2025-2026/matched-forecasts.csv";

const LOCATIONS = {
  SE: "Sverige",
  "SE-M": "Region Skåne",
  "SE-O": "Västra Götalandsregionen"
};

const MODELS = [
  { id: "hubdemo-persistence", label: "Senaste värdet", color: "#2563eb" },
  { id: "hubdemo-mean3", label: "Medelvärde, 3 veckor", color: "#16a34a" },
  { id: "hubdemo-mean6", label: "Medelvärde, 6 veckor", color: "#0891b2" },
  { id: "hubdemo-linear4", label: "Linjär trend, 4 veckor", color: "#ea580c" },
  { id: "hubdemo-damped4", label: "Dämpad trend, 4 veckor", color: "#9333ea" },
  { id: "hubdemo-exptrend4", label: "Exponentiell trend, 4 veckor", color: "#db2777" }
];

let forecastRows = [];

function parseCsv(text) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || record.length) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  const headers = records.shift();
  return records
    .filter((values) => values.length === headers.length)
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}

function isoWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function displayDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
  return `${formatted} (vecka ${isoWeek(dateString)})`;
}

function selectedModels() {
  return new Set(
    [...document.querySelectorAll("#point-model-checkboxes input:checked")]
      .map((checkbox) => checkbox.value)
  );
}

function renderModelControls() {
  const root = document.querySelector("#point-model-checkboxes");
  root.replaceChildren(...MODELS.map((model) => {
    const label = document.createElement("label");
    label.className = "point-model-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = model.id;
    checkbox.checked = true;
    checkbox.addEventListener("change", renderChart);
    const swatch = document.createElement("span");
    swatch.className = "point-model-swatch";
    swatch.style.backgroundColor = model.color;
    const text = document.createElement("span");
    text.textContent = model.label;
    label.append(checkbox, swatch, text);
    return label;
  }));
}

function renderChart() {
  const location = document.querySelector("#point-location").value;
  const referenceDate = document.querySelector("#point-reference-date").value;
  const status = document.querySelector("#point-forecast-status");
  if (!location || !referenceDate || !window.Plotly) return;

  const outcomeByDate = new Map();
  for (const row of forecastRows) {
    if (row.location === location && row.observed_value !== "") {
      outcomeByDate.set(row.target_end_date, Number(row.observed_value));
    }
  }
  const outcomes = [...outcomeByDate.entries()].sort(([left], [right]) => left.localeCompare(right));
  const traces = [{
    x: outcomes.map(([date]) => date),
    y: outcomes.map(([, value]) => value),
    type: "scatter",
    mode: "lines+markers",
    name: "Utfall",
    line: { color: "#111827", width: 3 },
    marker: { color: "#111827", size: 5 },
    hovertemplate: "%{x}<br>Utfall: %{y:.0f} fall<extra></extra>"
  }];

  const activeModels = selectedModels();
  for (const model of MODELS) {
    if (!activeModels.has(model.id)) continue;
    const rows = forecastRows
      .filter((row) => row.location === location && row.reference_date === referenceDate && row.model_id === model.id)
      .sort((left, right) => Number(left.horizon) - Number(right.horizon));
    traces.push({
      x: rows.map((row) => row.target_end_date),
      y: rows.map((row) => Number(row.forecast_value)),
      customdata: rows.map((row) => row.horizon),
      type: "scatter",
      mode: "lines+markers",
      name: model.label,
      line: { color: model.color, width: 2, dash: "dash" },
      marker: { color: model.color, size: 8, symbol: "circle-open" },
      hovertemplate: "%{x}<br>%{y:.1f} fall<br>Horisont %{customdata}<extra>" + model.label + "</extra>"
    });
  }

  const layout = {
    title: { text: `Punktprognoser från ${displayDate(referenceDate)} – ${LOCATIONS[location]}`, x: 0.01, xanchor: "left" },
    xaxis: { title: "Vecka", type: "date", hoverformat: "%Y-%m-%d" },
    yaxis: { title: "Rapporterade influensafall", rangemode: "tozero" },
    hovermode: "closest",
    legend: { orientation: "h", y: -0.22 },
    margin: { l: 70, r: 25, t: 85, b: 125 },
    shapes: [{
      type: "line",
      x0: referenceDate,
      x1: referenceDate,
      y0: 0,
      y1: 1,
      yref: "paper",
      line: { color: "#64748b", width: 1, dash: "dot" }
    }]
  };
  window.Plotly.react("point-forecast-chart", traces, layout, {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ["lasso2d", "select2d"]
  });
  const count = activeModels.size;
  status.textContent = `${count} av ${MODELS.length} testmodeller visas. Den lodräta linjen markerar prognosdatumet.`;
}

function selectAllModels(checked) {
  document.querySelectorAll("#point-model-checkboxes input").forEach((checkbox) => {
    checkbox.checked = checked;
  });
  renderChart();
}

async function initializePointForecasts() {
  const status = document.querySelector("#point-forecast-status");
  try {
    const response = await fetch(DATA_SOURCE);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    forecastRows = parseCsv(await response.text());
    if (!forecastRows.length) throw new Error("Datafilen innehåller inga prognoser");

    const locationSelect = document.querySelector("#point-location");
    const availableLocations = Object.keys(LOCATIONS).filter((location) => forecastRows.some((row) => row.location === location));
    locationSelect.replaceChildren(...availableLocations.map((location) => new Option(LOCATIONS[location], location)));

    const referenceSelect = document.querySelector("#point-reference-date");
    const referenceDates = [...new Set(forecastRows.map((row) => row.reference_date))].sort().reverse();
    referenceSelect.replaceChildren(...referenceDates.map((date) => new Option(displayDate(date), date)));

    renderModelControls();
    locationSelect.disabled = false;
    referenceSelect.disabled = false;
    locationSelect.addEventListener("change", renderChart);
    referenceSelect.addEventListener("change", renderChart);
    document.querySelector("#point-select-all").addEventListener("click", () => selectAllModels(true));
    document.querySelector("#point-clear-all").addEventListener("click", () => selectAllModels(false));
    renderChart();
  } catch (error) {
    status.textContent = "Punktprognoserna kunde inte läsas in. Använd länken till datafilen nedan.";
    console.error(error);
  }
}

initializePointForecasts();
