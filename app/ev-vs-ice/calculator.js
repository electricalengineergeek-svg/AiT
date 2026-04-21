/* ===== EV vs ICE TCO Calculator Logic ===== */

const EV_ICE_STORAGE_KEY = 'ev_ice_data';
const ICE_SERVICE_ANNUAL_COST = 500; // UAH per year
const EV_SERVICE_ANNUAL_COST = 200; // UAH per year
const ICE_FUEL_EFFICIENCY = 0.08; // 8L/100km standard conversion to L/km = 0.08
const EV_EFFICIENCY = 0.2; // 20 kWh/100km standard conversion to kWh/km = 0.2

// Default example values
const DEFAULT_EV_ICE_DATA = {
  icePrice: 300000,
  iceAnnualMileage: 15000,
  icePeriod: 7,
  iceFuelPrice: 50,
  iceFuelConsumption: 8,
  evPrice: 600000,
  evAnnualMileage: 15000,
  evPeriod: 7,
  evElectricityPrice: 5,
  evConsumption: 20
};

/**
 * Calculate TCO for ICE vehicle
 * @param {Object} data - Input data
 * @returns {Object} TCO result
 */
function calculateICETCO(data) {
  const {
    price,
    annualMileage,
    period,
    fuelPrice,
    fuelConsumption
  } = data;

  // Validate inputs
  if (!price || !annualMileage || !period || !fuelPrice || !fuelConsumption) {
    return { error: 'Заповніть усі поля для ДВЗ' };
  }

  // Convert fuel consumption from L/100km to L/km
  const fuelPerKm = fuelConsumption / 100;

  // Calculate total distance
  const totalDistance = annualMileage * period;

  // Calculate fuel cost
  const fuelCost = totalDistance * fuelPerKm * fuelPrice;

  // Calculate service cost
  const serviceCost = ICE_SERVICE_ANNUAL_COST * period;

  // Calculate total TCO
  const totalTCO = price + fuelCost + serviceCost;

  // Calculate cost per km
  const costPerKm = (fuelPerKm * fuelPrice) + (ICE_SERVICE_ANNUAL_COST / annualMileage);

  return {
    success: true,
    purchasePrice: price,
    totalDistance: Math.round(totalDistance),
    fuelCost: Math.round(fuelCost),
    serviceCost: Math.round(serviceCost),
    totalTCO: Math.round(totalTCO),
    costPerKm: costPerKm.toFixed(2),
    annualCost: Math.round((fuelCost + serviceCost) / period)
  };
}

/**
 * Calculate TCO for EV
 * @param {Object} data - Input data
 * @returns {Object} TCO result
 */
function calculateEVTCO(data) {
  const {
    price,
    annualMileage,
    period,
    electricityPrice,
    consumption
  } = data;

  // Validate inputs
  if (!price || !annualMileage || !period || !electricityPrice || !consumption) {
    return { error: 'Заповніть усі поля для EV' };
  }

  // Convert consumption from kWh/100km to kWh/km
  const energyPerKm = consumption / 100;

  // Calculate total distance
  const totalDistance = annualMileage * period;

  // Calculate electricity cost
  const electricityCost = totalDistance * energyPerKm * electricityPrice;

  // Calculate service cost
  const serviceCost = EV_SERVICE_ANNUAL_COST * period;

  // Calculate total TCO
  const totalTCO = price + electricityCost + serviceCost;

  // Calculate cost per km
  const costPerKm = (energyPerKm * electricityPrice) + (EV_SERVICE_ANNUAL_COST / annualMileage);

  return {
    success: true,
    purchasePrice: price,
    totalDistance: Math.round(totalDistance),
    electricityCost: Math.round(electricityCost),
    serviceCost: Math.round(serviceCost),
    totalTCO: Math.round(totalTCO),
    costPerKm: costPerKm.toFixed(2),
    annualCost: Math.round((electricityCost + serviceCost) / period)
  };
}

/**
 * Get ICE form values
 * @returns {Object} Form data
 */
function getICEFormValues() {
  return {
    price: parseFloat(document.getElementById('icePrice').value) || 0,
    annualMileage: parseFloat(document.getElementById('iceAnnualMileage').value) || 0,
    period: parseInt(document.getElementById('icePeriod').value) || 0,
    fuelPrice: parseFloat(document.getElementById('iceFuelPrice').value) || 0,
    fuelConsumption: parseFloat(document.getElementById('iceFuelConsumption').value) || 0
  };
}

/**
 * Get EV form values
 * @returns {Object} Form data
 */
function getEVFormValues() {
  return {
    price: parseFloat(document.getElementById('evPrice').value) || 0,
    annualMileage: parseFloat(document.getElementById('evAnnualMileage').value) || 0,
    period: parseInt(document.getElementById('evPeriod').value) || 0,
    electricityPrice: parseFloat(document.getElementById('evElectricityPrice').value) || 0,
    consumption: parseFloat(document.getElementById('evConsumption').value) || 0
  };
}

/**
 * Set form values
 * @param {Object} data - Form data
 * @param {string} type - 'ice' or 'ev'
 */
function setFormValues(data, type) {
  const prefix = type === 'ice' ? 'ice' : 'ev';
  
  if (type === 'ice') {
    if (data.icePrice) document.getElementById('icePrice').value = data.icePrice;
    if (data.iceAnnualMileage) document.getElementById('iceAnnualMileage').value = data.iceAnnualMileage;
    if (data.icePeriod) document.getElementById('icePeriod').value = data.icePeriod;
    if (data.iceFuelPrice) document.getElementById('iceFuelPrice').value = data.iceFuelPrice;
    if (data.iceFuelConsumption) document.getElementById('iceFuelConsumption').value = data.iceFuelConsumption;
  } else {
    if (data.evPrice) document.getElementById('evPrice').value = data.evPrice;
    if (data.evAnnualMileage) document.getElementById('evAnnualMileage').value = data.evAnnualMileage;
    if (data.evPeriod) document.getElementById('evPeriod').value = data.evPeriod;
    if (data.evElectricityPrice) document.getElementById('evElectricityPrice').value = data.evElectricityPrice;
    if (data.evConsumption) document.getElementById('evConsumption').value = data.evConsumption;
  }
}

/**
 * Display comparison results
 * @param {Object} iceResult - ICE calculation result
 * @param {Object} evResult - EV calculation result
 */
function displayResults(iceResult, evResult) {
  const resultsSection = document.getElementById('resultsSection');
  const resultsTable = document.getElementById('resultsTable');
  
  // Clear previous results
  resultsTable.innerHTML = '';

  // Add rows
  const rows = [
    ['Ціна покупки', formatCurrency(iceResult.purchasePrice), formatCurrency(evResult.purchasePrice)],
    ['Загальний пробіг', formatNumber(iceResult.totalDistance) + ' км', formatNumber(evResult.totalDistance) + ' км'],
    ['Вартість палива/електрики', formatCurrency(iceResult.fuelCost), formatCurrency(evResult.electricityCost)],
    ['Вартість сервісу', formatCurrency(iceResult.serviceCost), formatCurrency(evResult.serviceCost)],
    ['<strong>Загальна TCO</strong>', '<strong>' + formatCurrency(iceResult.totalTCO) + '</strong>', '<strong>' + formatCurrency(evResult.totalTCO) + '</strong>'],
    ['Вартість на 1км', iceResult.costPerKm + ' грн', evResult.costPerKm + ' грн'],
    ['Річні витрати', formatCurrency(iceResult.annualCost), formatCurrency(evResult.annualCost)]
  ];

  rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach((cell, index) => {
      const td = document.createElement('td');
      td.innerHTML = cell;
      tr.appendChild(td);
    });
    resultsTable.appendChild(tr);
  });

  // Determine winner
  const difference = Math.abs(iceResult.totalTCO - evResult.totalTCO);
  const isEvCheaper = evResult.totalTCO < iceResult.totalTCO;
  const savingText = formatCurrency(difference) + ' дешевше';
  const winnerText = isEvCheaper 
    ? `🔌 Електромобіль\n${savingText}`
    : `🚙 Автомобіль на ДВЗ\n${savingText}`;

  document.getElementById('winnerText').innerHTML = winnerText;

  // Show results section
  resultsSection.classList.remove('hidden');

  // Scroll to results
  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  }, 100);
}

/**
 * Save form values
 */
function saveFormValues() {
  const iceData = getICEFormValues();
  const evData = getEVFormValues();
  
  const allData = {
    icePrice: iceData.price,
    iceAnnualMileage: iceData.annualMileage,
    icePeriod: iceData.period,
    iceFuelPrice: iceData.fuelPrice,
    iceFuelConsumption: iceData.fuelConsumption,
    evPrice: evData.price,
    evAnnualMileage: evData.annualMileage,
    evPeriod: evData.period,
    evElectricityPrice: evData.electricityPrice,
    evConsumption: evData.consumption
  };

  saveData(EV_ICE_STORAGE_KEY, allData);
}

/**
 * Load form values
 */
function loadFormValues() {
  const saved = loadData(EV_ICE_STORAGE_KEY);
  if (saved) {
    setFormValues(saved, 'ice');
    setFormValues(saved, 'ev');
  } else {
    // Load default example values if no saved data
    setFormValues(DEFAULT_EV_ICE_DATA, 'ice');
    setFormValues(DEFAULT_EV_ICE_DATA, 'ev');
  }
}

/**
 * Clear all forms
 */
function clearAllForms() {
  document.getElementById('iceForm').reset();
  document.getElementById('evForm').reset();
  document.getElementById('resultsSection').classList.add('hidden');
  clearData(EV_ICE_STORAGE_KEY);
}

/**
 * Perform comparison
 */
function performComparison() {
  const iceData = getICEFormValues();
  const evData = getEVFormValues();

  // Calculate TCO
  const iceResult = calculateICETCO(iceData);
  const evResult = calculateEVTCO(evData);

  // Check for errors
  if (iceResult.error || evResult.error) {
    showNotification(iceResult.error || evResult.error, 'error');
    return;
  }

  // Save values
  saveFormValues();

  // Display results
  displayResults(iceResult, evResult);
}

// ===== Event Listeners =====

document.addEventListener('DOMContentLoaded', function() {
  // Setup back button
  setupBackButton(goBack);

  // Load saved values
  loadFormValues();

  // Auto-calculate with loaded values
  performComparison();

  // Auto-save on input change
  const iceInputs = document.querySelectorAll('#iceForm input, #iceForm select');
  const evInputs = document.querySelectorAll('#evForm input, #evForm select');

  [...iceInputs, ...evInputs].forEach(input => {
    input.addEventListener('change', saveFormValues);
  });
});
