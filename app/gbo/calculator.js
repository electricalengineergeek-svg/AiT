/* ===== GBO Calculator Logic ===== */

const GBO_STORAGE_KEY = 'gbo_data';
const GAS_VOLUME_COEFFICIENT = 1.2; // Gas consumption is 20% more than gasoline

// Default example values
const DEFAULT_GBO_DATA = {
  gboCost: 15000,
  gasolinePrice: 50,
  gasPrice: 25,
  fuelConsumption: 8,
  heatingCost: 0.5,
  annualMileage: 15000,
  annualMaintenance: 2000,
  filterServiceCost: 800,
  filterServiceInterval: 10000,
  diagnosticServiceCost: 1200,
  diagnosticServiceInterval: 20000,
  majorServiceCost: 10000,
  majorServiceInterval: 80000,
  scenarioSpread: 10
};

const SCENARIO_CONFIG = [
  { key: 'optimistic', label: 'Оптимістичний', gasolineFactor: 1, gasFactor: -1, color: '#4ad66d' },
  { key: 'base', label: 'Базовий', gasolineFactor: 0, gasFactor: 0, color: '#f39c12' },
  { key: 'pessimistic', label: 'Песимістичний', gasolineFactor: -1, gasFactor: 1, color: '#ff6b6b' }
];

let lastResult = null;

/**
 * Build maintenance schedule entries from form data
 * @param {Object} data - Input data
 * @returns {Array<Object>} Active schedules
 */
function getMaintenanceSchedules(data) {
  return [
    {
      name: 'Фільтри',
      cost: data.filterServiceCost,
      interval: data.filterServiceInterval
    },
    {
      name: 'Діагностика',
      cost: data.diagnosticServiceCost,
      interval: data.diagnosticServiceInterval
    },
    {
      name: 'Редуктор/форсунки',
      cost: data.majorServiceCost,
      interval: data.majorServiceInterval
    }
  ].filter(item => item.cost > 0);
}

/**
 * Calculate maintenance cost per km from schedule items
 * @param {Array<Object>} schedules - Maintenance schedule
 * @returns {number} Cost per km
 */
function calculateScheduledMaintenancePerKm(schedules) {
  return schedules.reduce((sum, item) => sum + (item.cost / item.interval), 0);
}

/**
 * Calculate one scenario with adjusted fuel prices
 * @param {Object} data - Base input data
 * @param {number} gasolineAdjustment - gasoline adjustment in range [-1..1]
 * @param {number} gasAdjustment - gas adjustment in range [-1..1]
 * @returns {Object} Scenario result
 */
function calculateScenario(data, gasolineAdjustment, gasAdjustment) {
  const fuelConsumptionPerKm = data.fuelConsumption / 100;
  const adjustedGasolinePrice = data.gasolinePrice * (1 + gasolineAdjustment);
  const adjustedGasPrice = data.gasPrice * (1 + gasAdjustment);

  const gasolineCostPerKm = adjustedGasolinePrice * fuelConsumptionPerKm;
  const gasCostPerKm = adjustedGasPrice * fuelConsumptionPerKm * GAS_VOLUME_COEFFICIENT;

  const annualMaintenancePerKm = data.annualMaintenance / data.annualMileage;
  const scheduleMaintenancePerKm = calculateScheduledMaintenancePerKm(getMaintenanceSchedules(data));
  const maintenanceCostPerKm = annualMaintenancePerKm + scheduleMaintenancePerKm;

  const totalGasCostPerKm = gasCostPerKm + data.heatingCost + maintenanceCostPerKm;
  const savingsPerKm = gasolineCostPerKm - totalGasCostPerKm;

  if (savingsPerKm <= 0) {
    return {
      success: false,
      error: 'Немає економії при таких цінах. Перевірте дані.'
    };
  }

  const paybackDistance = data.gboCost / savingsPerKm;
  const annualSavings = savingsPerKm * data.annualMileage;

  return {
    success: true,
    paybackDistance,
    paybackYears: paybackDistance / data.annualMileage,
    annualSavings,
    savingsPerKm,
    gasolineCostPerKm,
    gasCostPerKm,
    maintenanceCostPerKm,
    totalGasCostPerKm
  };
}

/**
 * Calculate GBO payback period
 * @param {Object} data - Input data
 * @returns {Object} Result object with payback info
 */
function calculatePayback(data) {
  const {
    gboCost,
    gasolinePrice,
    gasPrice,
    fuelConsumption,
    heatingCost,
    annualMileage,
    annualMaintenance,
    filterServiceCost,
    filterServiceInterval,
    diagnosticServiceCost,
    diagnosticServiceInterval,
    majorServiceCost,
    majorServiceInterval,
    scenarioSpread
  } = data;

  // Validate inputs
  if (!gboCost || !gasolinePrice || !gasPrice || !fuelConsumption || !annualMileage) {
    return { error: 'Заповніть усі поля' };
  }

  if (
    gboCost < 0 ||
    gasolinePrice < 0 ||
    gasPrice < 0 ||
    fuelConsumption < 0 ||
    heatingCost < 0 ||
    annualMaintenance < 0 ||
    annualMileage <= 0 ||
    filterServiceCost < 0 ||
    filterServiceInterval <= 0 ||
    diagnosticServiceCost < 0 ||
    diagnosticServiceInterval <= 0 ||
    majorServiceCost < 0 ||
    majorServiceInterval <= 0 ||
    scenarioSpread < 0
  ) {
    return { error: 'Значення не можуть бути негативними' };
  }

  const spread = scenarioSpread / 100;
  const scenarioResults = SCENARIO_CONFIG.map(item => {
    const scenario = calculateScenario(
      data,
      item.gasolineFactor * spread,
      item.gasFactor * spread
    );

    return {
      key: item.key,
      label: item.label,
      color: item.color,
      ...scenario
    };
  });

  const baseScenario = scenarioResults.find(item => item.key === 'base');
  if (!baseScenario || !baseScenario.success) {
    return { error: 'Немає економії у базовому сценарії. Перевірте дані.' };
  }

  const annualDistance = annualMileage;

  return {
    success: true,
    gboCost,
    paybackDistance: Math.round(baseScenario.paybackDistance),
    paybackYears: baseScenario.paybackYears.toFixed(1),
    annualDistance: Math.round(annualDistance),
    savingsPerKm: baseScenario.savingsPerKm.toFixed(2),
    annualSavings: Math.round(baseScenario.annualSavings),
    gasolineCostPerKm: baseScenario.gasolineCostPerKm.toFixed(2),
    gasCostPerKm: baseScenario.gasCostPerKm.toFixed(2),
    maintenanceCostPerKm: baseScenario.maintenanceCostPerKm.toFixed(2),
    totalGasCostPerKm: baseScenario.totalGasCostPerKm.toFixed(2),
    scenarios: scenarioResults
  };
}

/**
 * Get form values
 * @returns {Object} Form data
 */
function getFormValues() {
  return {
    gboCost: parseFloat(document.getElementById('gboCost').value) || 0,
    gasolinePrice: parseFloat(document.getElementById('gasolinePrice').value) || 0,
    gasPrice: parseFloat(document.getElementById('gasPrice').value) || 0,
    fuelConsumption: parseFloat(document.getElementById('fuelConsumption').value) || 0,
    heatingCost: parseFloat(document.getElementById('heatingCost').value) || 0,
    annualMileage: parseFloat(document.getElementById('annualMileage').value) || 0,
    annualMaintenance: parseFloat(document.getElementById('annualMaintenance').value) || 0,
    filterServiceCost: parseFloat(document.getElementById('filterServiceCost').value) || 0,
    filterServiceInterval: parseFloat(document.getElementById('filterServiceInterval').value) || 1,
    diagnosticServiceCost: parseFloat(document.getElementById('diagnosticServiceCost').value) || 0,
    diagnosticServiceInterval: parseFloat(document.getElementById('diagnosticServiceInterval').value) || 1,
    majorServiceCost: parseFloat(document.getElementById('majorServiceCost').value) || 0,
    majorServiceInterval: parseFloat(document.getElementById('majorServiceInterval').value) || 1,
    scenarioSpread: parseFloat(document.getElementById('scenarioSpread').value) || 0
  };
}

/**
 * Set form values
 * @param {Object} data - Form data
 */
function setFormValues(data) {
  if (data.gboCost) document.getElementById('gboCost').value = data.gboCost;
  if (data.gasolinePrice) document.getElementById('gasolinePrice').value = data.gasolinePrice;
  if (data.gasPrice) document.getElementById('gasPrice').value = data.gasPrice;
  if (data.fuelConsumption) document.getElementById('fuelConsumption').value = data.fuelConsumption;
  if (data.heatingCost) document.getElementById('heatingCost').value = data.heatingCost;
  if (data.annualMileage) document.getElementById('annualMileage').value = data.annualMileage;
  if (typeof data.annualMaintenance === 'number') document.getElementById('annualMaintenance').value = data.annualMaintenance;
  if (typeof data.filterServiceCost === 'number') document.getElementById('filterServiceCost').value = data.filterServiceCost;
  if (typeof data.filterServiceInterval === 'number') document.getElementById('filterServiceInterval').value = data.filterServiceInterval;
  if (typeof data.diagnosticServiceCost === 'number') document.getElementById('diagnosticServiceCost').value = data.diagnosticServiceCost;
  if (typeof data.diagnosticServiceInterval === 'number') document.getElementById('diagnosticServiceInterval').value = data.diagnosticServiceInterval;
  if (typeof data.majorServiceCost === 'number') document.getElementById('majorServiceCost').value = data.majorServiceCost;
  if (typeof data.majorServiceInterval === 'number') document.getElementById('majorServiceInterval').value = data.majorServiceInterval;
  if (typeof data.scenarioSpread === 'number') document.getElementById('scenarioSpread').value = data.scenarioSpread;
}

/**
 * Update helper text for scenario spread field
 */
function updateScenarioPreview() {
  const preview = document.getElementById('scenarioPreview');
  if (!preview) return;

  const gasolinePrice = parseFloat(document.getElementById('gasolinePrice').value) || 0;
  const gasPrice = parseFloat(document.getElementById('gasPrice').value) || 0;
  const spreadPercent = parseFloat(document.getElementById('scenarioSpread').value) || 0;
  const spread = spreadPercent / 100;

  if (gasolinePrice <= 0 || gasPrice <= 0) {
    preview.textContent = 'Підказка з конкретними цінами зявиться після введення цін бензину і газу.';
    return;
  }

  const optimisticGasoline = gasolinePrice * (1 + spread);
  const optimisticGas = gasPrice * (1 - spread);
  const pessimisticGasoline = gasolinePrice * (1 - spread);
  const pessimisticGas = gasPrice * (1 + spread);

  preview.textContent =
    `При X=${formatNumber(spreadPercent)}%: Оптимістичний (бензин ${formatNumber(optimisticGasoline, 2)}, газ ${formatNumber(optimisticGas, 2)}), ` +
    `Базовий (бензин ${formatNumber(gasolinePrice, 2)}, газ ${formatNumber(gasPrice, 2)}), ` +
    `Песимістичний (бензин ${formatNumber(pessimisticGasoline, 2)}, газ ${formatNumber(pessimisticGas, 2)}).`;
}

/**
 * Render scenarios table
 * @param {Array<Object>} scenarios - Scenario results
 */
function renderScenarioTable(scenarios) {
  const tableBody = document.getElementById('scenarioTableBody');
  if (!tableBody) return;

  const rows = scenarios.map(item => {
    if (!item.success) {
      return `<tr><td>${item.label}</td><td colspan="2" class="text-muted">Немає економії при цих цінах</td></tr>`;
    }

    const paybackText = `${formatNumber(Math.round(item.paybackDistance))} км (${item.paybackYears.toFixed(1)} р.)`;
    const annualText = `${formatNumber(Math.round(item.annualSavings))} грн`;
    return `<tr><td>${item.label}</td><td>${paybackText}</td><td>${annualText}</td></tr>`;
  });

  tableBody.innerHTML = rows.join('');
}

/**
 * Build SVG polyline path for chart
 * @param {Array<{x:number, y:number}>} points - Points
 * @returns {string} SVG path
 */
function toSvgPath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
}

/**
 * Render savings chart
 * @param {Object} result - Calculation result
 */
function renderSavingsChart(result) {
  const svg = document.getElementById('savingsChart');
  if (!svg || !result.scenarios) return;

  const chartModeSelect = document.getElementById('chartMode');
  const chartMode = chartModeSelect ? chartModeSelect.value : 'km';

  const successfulScenarios = result.scenarios.filter(item => item.success);
  if (successfulScenarios.length === 0) {
    svg.innerHTML = '';
    return;
  }

  const width = 560;
  const height = 280;
  const padLeft = 54;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 34;

  const maxDistance = Math.max(...successfulScenarios.map(item => item.paybackDistance)) * 1.2;
  const maxY = Math.max(...successfulScenarios.map(item => item.annualSavings * 3));
  const minY = -Math.max(...successfulScenarios.map(item => item.paybackDistance)) * 0.05;

  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  const scaleX = value => padLeft + (value / maxDistance) * chartWidth;
  const scaleY = value => padTop + ((maxY - value) / (maxY - minY)) * chartHeight;

  const axisX = `<line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="#555" stroke-width="1"/>`;
  const axisY = `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" stroke="#555" stroke-width="1"/>`;

  const zeroY = scaleY(0);
  const zeroLine = `<line x1="${padLeft}" y1="${zeroY.toFixed(2)}" x2="${width - padRight}" y2="${zeroY.toFixed(2)}" stroke="#666" stroke-width="1" stroke-dasharray="4 4"/>`;

  const tickDistances = [0.25, 0.5, 0.75, 1].map(ratio => maxDistance * ratio);
  const xTicks = tickDistances.map(value => {
    const x = scaleX(value);
    const xLabel = chartMode === 'months'
      ? Math.round((value / result.annualDistance) * 12)
      : Math.round(value);
    return `
      <line x1="${x.toFixed(2)}" y1="${height - padBottom}" x2="${x.toFixed(2)}" y2="${height - padBottom + 4}" stroke="#777" stroke-width="1"/>
      <text x="${x.toFixed(2)}" y="${height - 8}" font-size="10" text-anchor="middle" fill="#bbb">${formatNumber(xLabel)}</text>
    `;
  }).join('');

  const yTicks = [0, 0.33, 0.66, 1].map(ratio => minY + (maxY - minY) * ratio);
  const yTickLines = yTicks.map(value => {
    const y = scaleY(value);
    return `
      <line x1="${padLeft - 4}" y1="${y.toFixed(2)}" x2="${padLeft}" y2="${y.toFixed(2)}" stroke="#777" stroke-width="1"/>
      <text x="${padLeft - 8}" y="${(y + 4).toFixed(2)}" font-size="10" text-anchor="end" fill="#bbb">${formatNumber(Math.round(value))}</text>
    `;
  }).join('');

  const lines = successfulScenarios.map(item => {
    const points = [0, maxDistance].map(distance => ({
      x: scaleX(distance),
      y: scaleY((item.savingsPerKm * distance) - result.gboCost)
    }));
    return `<path d="${toSvgPath(points)}" fill="none" stroke="${item.color}" stroke-width="2"/>`;
  }).join('');

  const baseScenario = result.scenarios.find(item => item.key === 'base' && item.success);
  if (!baseScenario) {
    svg.innerHTML = `${axisX}${axisY}${zeroLine}${xTicks}${yTickLines}${lines}${labels}`;
    return;
  }
  const paybackX = scaleX(baseScenario.paybackDistance);
  const paybackLine = `<line x1="${paybackX.toFixed(2)}" y1="${padTop}" x2="${paybackX.toFixed(2)}" y2="${height - padBottom}" stroke="#58a6ff" stroke-width="2" stroke-dasharray="6 4"/>`;

  const labels = `
    <text x="${width / 2}" y="${height - 2}" font-size="11" text-anchor="middle" fill="#bbb">${chartMode === 'months' ? 'Час, міс.' : 'Пробіг, км'}</text>
    <text x="18" y="${height / 2}" transform="rotate(-90, 18, ${height / 2})" font-size="11" text-anchor="middle" fill="#bbb">Накопичена економія, грн</text>
  `;

  svg.innerHTML = `${axisX}${axisY}${zeroLine}${xTicks}${yTickLines}${lines}${paybackLine}${labels}`;
}

/**
 * Display result
 * @param {Object} result - Calculation result
 */
function displayResult(result) {
  const resultBox = document.getElementById('resultBox');
  
  if (result.error) {
    resultBox.classList.remove('show');
    showNotification(result.error, 'error');
    return;
  }

  // Update result display
  document.getElementById('resultValue').textContent = 
    `${formatNumber(result.paybackDistance)} км (${result.paybackYears} років)`;
  
  document.getElementById('savingsPerKm').textContent = 
    `${result.savingsPerKm} грн`;

  document.getElementById('maintenancePerKm').textContent =
    `${result.maintenanceCostPerKm} грн`;

  document.getElementById('annualMileageValue').textContent =
    formatNumber(result.annualDistance);
  
  document.getElementById('annualSavings').textContent = 
    `${formatNumber(result.annualSavings)} грн`;

  renderScenarioTable(result.scenarios);
  renderSavingsChart(result);
  lastResult = result;

  // Show result box
  resultBox.classList.add('show');
}

/**
 * Save form values to localStorage
 */
function saveFormValues() {
  const values = getFormValues();
  saveData(GBO_STORAGE_KEY, values);
}

/**
 * Load form values from localStorage
 */
function loadFormValues() {
  const saved = loadData(GBO_STORAGE_KEY);
  if (saved) {
    setFormValues({ ...DEFAULT_GBO_DATA, ...saved });
  } else {
    // Load default example values if no saved data
    setFormValues(DEFAULT_GBO_DATA);
  }
}

/**
 * Clear form
 */
function clearForm() {
  document.getElementById('gboForm').reset();
  document.getElementById('resultBox').classList.remove('show');
  const tableBody = document.getElementById('scenarioTableBody');
  if (tableBody) {
    tableBody.innerHTML = '<tr><td colspan="3" class="text-muted">Натисніть "Розрахувати"</td></tr>';
  }
  const chart = document.getElementById('savingsChart');
  if (chart) {
    chart.innerHTML = '';
  }
  lastResult = null;
  clearData(GBO_STORAGE_KEY);
}

// ===== Event Listeners =====

document.addEventListener('DOMContentLoaded', function() {
  // Setup back button
  setupBackButton(goToHome);

  // Load saved values
  loadFormValues();
  updateScenarioPreview();

  // Auto-calculate with loaded values
  const initialData = getFormValues();
  const initialResult = calculatePayback(initialData);
  if (initialResult.success) {
    displayResult(initialResult);
  }

  // Form submission
  document.getElementById('gboForm').addEventListener('submit', function(e) {
    e.preventDefault();

    // Get form values
    const formData = getFormValues();

    // Calculate payback
    const result = calculatePayback(formData);

    // Save values to localStorage
    if (result.success) {
      saveFormValues();
    }

    // Display result
    displayResult(result);
  });

  // Auto-save on input change
  const inputs = document.querySelectorAll('#gboForm input');
  inputs.forEach(input => {
    input.addEventListener('change', function() {
      saveFormValues();
      updateScenarioPreview();
    });
    input.addEventListener('input', updateScenarioPreview);
  });

  const chartModeSelect = document.getElementById('chartMode');
  if (chartModeSelect) {
    chartModeSelect.addEventListener('change', function() {
      if (lastResult) {
        renderSavingsChart(lastResult);
      }
    });
  }
});
