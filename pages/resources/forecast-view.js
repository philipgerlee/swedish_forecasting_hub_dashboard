const DATA_ROOT = "https://raw.githubusercontent.com/philipgerlee/swedish_forecasting_hub/dashboard-data";

const LOCATIONS = {
  SE: "Sverige",
  "SE-M": "Region Skåne",
  "SE-O": "Västra Götalandsregionen"
};

const COLORS = [
  "#2563eb", "#16a34a", "#ea580c", "#9333ea", "#db2777",
  "#0891b2", "#a16207", "#4f46e5", "#be123c", "#0f766e"
];

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
  const headers = records.shift() || [];
  return records
    .filter((values) => values.length === headers.length)
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}

function isoWeek(dateString) {
  const value = new Date(`${dateString}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
}

function displayDate(dateString) {
  const value = new Date(`${dateString}T00:00:00Z`);
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(value);
  return `${formatted} (vecka ${isoWeek(dateString)})`;
}

function selectedModels() {
  return new Set(
    [...document.querySelectorAll("#forecast-model-checkboxes input:checked")]
      .map((checkbox) => checkbox.value)
  );
}

function bandTrace(rows, lower, upper, name, fillcolor) {
  const byHorizon = new Map();
  for (const row of rows) {
    const horizon = Number(row.horizon);
    if (!byHorizon.has(horizon)) byHorizon.set(horizon, new Map());
    byHorizon.get(horizon).set(Number(row.output_type_id), Number(row.value));
  }
  const horizons = [...byHorizon.keys()].sort((left, right) => left - right);
  const dates = horizons.map((horizon) => rows.find((row) => Number(row.horizon) === horizon).target_end_date);
  const lows = horizons.map((horizon) => byHorizon.get(horizon).get(lower));
  const highs = horizons.map((horizon) => byHorizon.get(horizon).get(upper));
  return {
    x: dates.concat([...dates].reverse()),
    y: highs.concat([...lows].reverse()),
    type: "scatter",
    mode: "lines",
    name,
    fill: "toself",
    fillcolor,
    line: { width: 0 },
    hoverinfo: "skip"
  };
}

async function initializeForecastView() {
  const explorer = document.querySelector(".forecast-explorer");
  if (!explorer) return;
  const mode = explorer.dataset.forecastMode;
  const prefix = mode === "current" ? "current" : "retrospective";
  const status = document.querySelector("#forecast-status");

  try {
    const [pointResponse, qraResponse, outcomeResponse, modelResponse] = await Promise.all([
      fetch(`${DATA_ROOT}/${prefix}-point.csv`, { cache: "no-store" }),
      fetch(`${DATA_ROOT}/${prefix}-qra.csv`, { cache: "no-store" }),
      fetch(`${DATA_ROOT}/${prefix}-outcomes.csv`, { cache: "no-store" }),
      fetch(`${DATA_ROOT}/models.json`, { cache: "no-store" })
    ]);
    for (const response of [pointResponse, qraResponse, outcomeResponse, modelResponse]) {
      if (!response.ok) throw new Error(`HTTP ${response.status} för ${response.url}`);
    }
    const pointRows = parseCsv(await pointResponse.text());
    const qraRows = parseCsv(await qraResponse.text());
    const outcomeRows = parseCsv(await outcomeResponse.text());
    const metadata = (await modelResponse.json()).models;
    const modelNames = new Map(metadata.map((model) => [model.model_id, model.model_name]));
    const modelIds = [...new Set(pointRows.map((row) => row.model_id))].sort();
    const modelColors = new Map(modelIds.map((model, index) => [model, COLORS[index % COLORS.length]]));

    const locationSelect = document.querySelector("#forecast-location");
    const locations = Object.keys(LOCATIONS).filter((location) => pointRows.some((row) => row.location === location));
    locationSelect.replaceChildren(...locations.map((location) => new Option(LOCATIONS[location], location)));

    const referenceSelect = document.querySelector("#forecast-reference-date");
    const referenceDates = [...new Set(pointRows.map((row) => row.reference_date))].sort().reverse();
    referenceSelect.replaceChildren(...referenceDates.map((reference) => new Option(displayDate(reference), reference)));

    const modelRoot = document.querySelector("#forecast-model-checkboxes");
    modelRoot.replaceChildren(...modelIds.map((modelId) => {
      const label = document.createElement("label");
      label.className = "forecast-model-option";
      label.dataset.modelId = modelId;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = modelId;
      checkbox.checked = true;
      const swatch = document.createElement("span");
      swatch.className = "forecast-model-swatch";
      swatch.style.backgroundColor = modelColors.get(modelId);
      const text = document.createElement("span");
      text.className = "forecast-model-name";
      text.textContent = modelNames.get(modelId) || modelId;
      label.append(checkbox, swatch, text);
      return label;
    }));

    const earlierButton = document.querySelector("#forecast-date-earlier");
    const laterButton = document.querySelector("#forecast-date-later");
    const datePosition = document.querySelector("#forecast-date-position");

    function render() {
      const location = locationSelect.value;
      const referenceDate = referenceSelect.value;
      const activeModels = selectedModels();
      const traces = [];
      const selectedQra = document.querySelector("#forecast-qra").checked;
      const selectedQraRows = qraRows.filter((row) => row.location === location && row.reference_date === referenceDate);
      const availableModels = new Set(
        pointRows
          .filter((row) => row.location === location && row.reference_date === referenceDate)
          .map((row) => row.model_id)
      );

      modelRoot.querySelectorAll(".forecast-model-option").forEach((option) => {
        const modelId = option.dataset.modelId;
        const available = availableModels.has(modelId);
        option.classList.toggle("forecast-model-unavailable", !available);
        option.title = available ? "" : "Ingen prognos för valt datum";
        option.querySelector(".forecast-model-name").textContent = available
          ? (modelNames.get(modelId) || modelId)
          : `${modelNames.get(modelId) || modelId} – ingen prognos detta datum`;
      });

      if (selectedQra && selectedQraRows.length) {
        traces.push(
          bandTrace(selectedQraRows, 0.025, 0.975, "QRA 95 %", "rgba(7, 89, 133, 0.10)"),
          bandTrace(selectedQraRows, 0.1, 0.9, "QRA 80 %", "rgba(7, 89, 133, 0.16)"),
          bandTrace(selectedQraRows, 0.25, 0.75, "QRA 50 %", "rgba(7, 89, 133, 0.24)")
        );
        const median = selectedQraRows
          .filter((row) => Number(row.output_type_id) === 0.5)
          .sort((left, right) => Number(left.horizon) - Number(right.horizon));
        traces.push({
          x: median.map((row) => row.target_end_date),
          y: median.map((row) => Number(row.value)),
          type: "scatter",
          mode: "lines+markers",
          name: "QRA-median",
          line: { color: "#075985", width: 4 },
          marker: { color: "#075985", size: 8 },
          hovertemplate: "%{x}<br>QRA-median: %{y:.1f} fall<extra></extra>"
        });
      }

      let shownPointModels = 0;
      for (const modelId of modelIds) {
        if (!activeModels.has(modelId)) continue;
        const rows = pointRows
          .filter((row) => row.location === location && row.reference_date === referenceDate && row.model_id === modelId)
          .sort((left, right) => Number(left.horizon) - Number(right.horizon));
        if (!rows.length) continue;
        shownPointModels += 1;
        const label = modelNames.get(modelId) || modelId;
        traces.push({
          x: rows.map((row) => row.target_end_date),
          y: rows.map((row) => Number(row.forecast_value)),
          customdata: rows.map((row) => row.horizon),
          type: "scatter",
          mode: "lines+markers",
          name: label,
          line: { color: modelColors.get(modelId), width: 2, dash: "dash" },
          marker: { color: modelColors.get(modelId), size: 8, symbol: "circle-open" },
          hovertemplate: `%{x}<br>%{y:.1f} fall<br>Horisont %{customdata}<extra>${label}</extra>`
        });
      }

      const outcomeByDate = new Map();
      for (const row of outcomeRows) {
        if (row.location === location && row.value !== "" && row.status !== "suppressed") {
          outcomeByDate.set(row.target_end_date || row.date, Number(row.value));
        }
      }
      const outcomes = [...outcomeByDate.entries()].sort(([left], [right]) => left.localeCompare(right));
      traces.push({
        x: outcomes.map(([target]) => target),
        y: outcomes.map(([, value]) => value),
        type: "scatter",
        mode: "lines+markers",
        name: "Utfall",
        line: { color: "#111827", width: 3 },
        marker: { color: "#111827", size: 5 },
        hovertemplate: "%{x}<br>Utfall: %{y:.0f} fall<extra></extra>"
      });

      const layout = {
        title: { text: `${mode === "current" ? "Aktuella" : "Retrospektiva"} prognoser från ${displayDate(referenceDate)} – ${LOCATIONS[location]}`, x: 0.01, xanchor: "left" },
        xaxis: { title: "Vecka", type: "date", hoverformat: "%Y-%m-%d" },
        yaxis: { title: "Rapporterade influensafall", rangemode: "tozero" },
        hovermode: "closest",
        legend: { orientation: "h", y: -0.24 },
        margin: { l: 70, r: 25, t: 90, b: 145 },
        shapes: [{
          type: "line", x0: referenceDate, x1: referenceDate, y0: 0, y1: 1, yref: "paper",
          line: { color: "#64748b", width: 1, dash: "dot" }
        }]
      };
      window.Plotly.react("forecast-chart", traces, layout, {
        displaylogo: false,
        responsive: true,
        modeBarButtonsToRemove: ["lasso2d", "select2d"]
      });

      const components = selectedQraRows.length
        ? Number(selectedQraRows[0].component_model_count)
        : 0;
      const qraText = selectedQra
        ? (components ? ` QRA:n bygger på ${components} komponentmodell${components === 1 ? "" : "er"}.` : " Ingen QRA finns för denna omgång.")
        : " QRA:n är dold.";
      status.textContent = `${modelIds.length} modeller har lämnat prognoser denna säsong; ${availableModels.size} har prognos för valt datum och ${shownPointModels} visas.${qraText}`;

      const referenceIndex = referenceDates.indexOf(referenceDate);
      earlierButton.disabled = referenceIndex === referenceDates.length - 1;
      laterButton.disabled = referenceIndex === 0;
      datePosition.textContent = `Prognosdatum ${referenceDates.length - referenceIndex} av ${referenceDates.length}`;
    }

    function moveReferenceDate(step) {
      const currentIndex = referenceDates.indexOf(referenceSelect.value);
      const nextIndex = Math.min(
        referenceDates.length - 1,
        Math.max(0, currentIndex + step)
      );
      if (nextIndex === currentIndex) return;
      referenceSelect.value = referenceDates[nextIndex];
      render();
    }

    locationSelect.disabled = false;
    referenceSelect.disabled = false;
    locationSelect.addEventListener("change", render);
    referenceSelect.addEventListener("change", render);
    document.querySelector("#forecast-qra").addEventListener("change", render);
    modelRoot.querySelectorAll("input").forEach((input) => input.addEventListener("change", render));
    document.querySelector("#forecast-select-all").addEventListener("click", () => {
      modelRoot.querySelectorAll("input").forEach((input) => { input.checked = true; });
      render();
    });
    document.querySelector("#forecast-clear-all").addEventListener("click", () => {
      modelRoot.querySelectorAll("input").forEach((input) => { input.checked = false; });
      render();
    });
    earlierButton.addEventListener("click", () => moveReferenceDate(1));
    laterButton.addEventListener("click", () => moveReferenceDate(-1));
    render();
  } catch (error) {
    status.textContent = "Prognosdata kunde inte läsas in. Försök igen om en stund.";
    console.error(error);
  }
}

initializeForecastView();
