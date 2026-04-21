/* ===== GBO Calculator Logic ===== */

const GBO_STORAGE_KEY = 'gbo_data';
const GAS_VOLUME_COEFFICIENT = 1.2; // Gas consumption is 20% more than gasoline

// Default example values
const DEFAULT_GBO_DATA = {
  gboCost: 15000,
  gasolinePrice: 50,
  gasPrice: 25,
  fuelConsumption: 8,
  heatingCost: 0.5
};

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
    heatingCost
  } = data;

  // Validate inputs
  if (!gboCost || !gasolinePrice || !gasPrice || !fuelConsumption) {
    return { error: 'Заповніть усі поля' };
  }

  if (gboCost < 0 || gasolinePrice < 0 || gasPrice < 0 || fuelConsumption < 0 || heatingCost < 0) {
    return { error: 'Значення не можуть бути негативними' };
  }

  // Calculate fuel consumption per km (convert from l/100km to l/km)
  const fuelConsumptionPerKm = fuelConsumption / 100;

  // Calculate cost per km with gasoline
  const gasolineCostPerKm = gasolinePrice * fuelConsumptionPerKm;

  // Calculate cost per km with gas (including volume coefficient)
  const gasCostPerKm = gasPrice * fuelConsumptionPerKm * GAS_VOLUME_COEFFICIENT;

  // Calculate total gas cost (gas + heating)
  const totalGasCostPerKm = gasCostPerKm + heatingCost;

  // Calculate savings per km
  const savingsPerKm = gasolineCostPerKm - totalGasCostPerKm;

  // Check if savings are positive
  if (savingsPerKm <= 0) {
    return { error: 'Немає економії при таких цінах. Перевірте дані.' };
  }

  // Calculate payback distance
  const paybackDistance = gboCost / savingsPerKm;

  // Calculate annual savings (assuming 15000 km/year average)
  const annualDistance = 15000;
  const annualSavings = savingsPerKm * annualDistance;

  // Calculate payback years
  const paybackYears = paybackDistance / annualDistance;

  return {
    success: true,
    paybackDistance: Math.round(paybackDistance),
    paybackYears: paybackYears.toFixed(1),
    savingsPerKm: savingsPerKm.toFixed(2),
    annualSavings: Math.round(annualSavings),
    gasolineCostPerKm: gasolineCostPerKm.toFixed(2),
    gasCostPerKm: gasCostPerKm.toFixed(2),
    totalGasCostPerKm: totalGasCostPerKm.toFixed(2)
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
    heatingCost: parseFloat(document.getElementById('heatingCost').value) || 0
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
  
  document.getElementById('annualSavings').textContent = 
    `${formatNumber(result.annualSavings)} грн`;

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
    setFormValues(saved);
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
  clearData(GBO_STORAGE_KEY);
}

// ===== Event Listeners =====

document.addEventListener('DOMContentLoaded', function() {
  // Setup back button
  setupBackButton(goToHome);

  // Load saved values
  loadFormValues();

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
    input.addEventListener('change', saveFormValues);
  });
});
