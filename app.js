/**
 * @typedef {Object} Transaction
 * @property {string}                        id        - UUID v4 generated with crypto.randomUUID()
 * @property {string}                        name      - Item name, 1–100 characters
 * @property {number}                        amount    - Positive number, 0.01–999,999,999.99
 * @property {'income'|'expense'}            type      - Transaction type
 * @property {'Food'|'Transport'|'Fun'|'Work'|'Other'} category - Spending category
 * @property {number}                        timestamp - Date.now() at creation, used for sort order
 */

/**
 * @typedef {Object} CategoryMap
 * @property {number} Food      - Total expense amount for Food
 * @property {number} Transport - Total expense amount for Transport
 * @property {number} Fun       - Total expense amount for Fun
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean}  valid  - true if all fields pass validation
 * @property {string[]} errors - Human-readable error messages (empty when valid)
 */

/** @type {Transaction[]} In-memory array — single source of truth */
let transactions = [];

/** @type {import('chart.js').Chart|null} Chart.js instance */
let chart = null;

/**
 * @param {Transaction[]} txArray
 * @returns {number}
 */
function calcBalance(txArray) {
  if (txArray.length === 0) return 0;
  let incomeSum = 0;
  let expenseSum = 0;
  for (const tx of txArray) {
    if (tx.type === 'income') incomeSum += tx.amount;
    else if (tx.type === 'expense') expenseSum += tx.amount;
  }
  return incomeSum - expenseSum;
}

/**
 * @param {Transaction[]} txArray
 * @returns {CategoryMap}
 */
function calcCategoryTotals(txArray) {
  const totals = { Food: 0, Transport: 0, Fun: 0, Work: 0, Other: 0 };
  for (const tx of txArray) {
    if (tx.type !== 'expense') continue;

    const category = typeof tx.category === 'string' ? tx.category.trim() : '';
    if (['Food', 'Transport', 'Fun', 'Work', 'Other'].includes(category)) {
      totals[category] += tx.amount;
    } else {
      totals.Other += tx.amount;
    }
  }
  return totals;
}

/**
 * @param {{ name: string, amount: number|string, type: string, category: string }} data
 * @returns {ValidationResult}
 */
function validateForm(data) {
  const errors = [];

  if (!data.name || data.name.trim().length === 0) {
    errors.push('Item name is required.');
  } else if (data.name.trim().length > 100) {
    errors.push('Item name must not exceed 100 characters.');
  }

  const amount = Number(data.amount);
  if (isNaN(amount) || amount <= 0) {
    errors.push('Amount must be a positive number.');
  } else if (amount > 999_999_999.99) {
    errors.push('Amount must not exceed 999,999,999.99.');
  }

  if (!data.type) errors.push('Transaction type is required.');
  if (!data.category) errors.push('Category is required.');
  if (data.category === 'Other' && (!data.customCategory || data.customCategory.trim().length === 0)) {
    errors.push('Please enter a custom category.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * @param {Transaction} tx
 * @returns {string} "+N.NN" for income, "-N.NN" for expense
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNumberInput(value) {
  const digitsOnly = value.replace(/[^\d]/g, '');
  if (!digitsOnly) return '';
  return Number(digitsOnly).toLocaleString('id-ID');
}

function formatAmount(tx) {
  const sign = tx.type === 'income' ? '+' : '-';
  return `${sign}${formatCurrency(Math.abs(tx.amount))}`;
}

function formatCategoryLabel(category) {
  const labelMap = {
    Food: 'Makanan',
    Transport: 'Transportasi',
    Fun: 'Hiburan',
    Work: 'Pekerjaan',
    Other: 'Lainnya',
  };
  return labelMap[category] || category;
}

/**
 * @returns {string}
 */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * @param {{ name: string, amount: number, type: 'income'|'expense', category: 'Food'|'Transport'|'Fun' }} tx
 * @returns {Transaction[]}
 */
function addTransaction(tx) {
  const newTx = { ...tx, id: generateId(), timestamp: Date.now() };
  transactions.push(newTx);
  return transactions;
}

/**
 * @param {string} id
 * @returns {Transaction[]}
 */
function deleteTransaction(id) {
  transactions = transactions.filter(tx => tx.id !== id);
  return transactions;
}

function render() {
  const filterType = document.getElementById('filter-type')?.value || 'all';
  const sortBy = document.getElementById('sort-by')?.value || 'latest';

  // --- Balance ---
  const balanceEl = document.getElementById('balance-display');
  if (balanceEl) {
    const balance = calcBalance(transactions);
    balanceEl.textContent = formatCurrency(balance);
    balanceEl.className = 'balance-amount ' + (balance >= 0 ? 'positive' : 'negative');
  }

  // --- Transaction List ---
  const listEl = document.getElementById('transaction-list');
  const emptyMsg = document.getElementById('empty-list-msg');
  if (listEl) {
   
    Array.from(listEl.querySelectorAll('.transaction-item')).forEach(el => el.remove());

    const filtered = transactions.filter((tx) => filterType === 'all' || tx.type === filterType);
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'amount-desc') return b.amount - a.amount;
      if (sortBy === 'amount-asc') return a.amount - b.amount;
      if (sortBy === 'category') return a.category.localeCompare(b.category);
      return b.timestamp - a.timestamp;
    });

    if (sorted.length === 0) {
      if (emptyMsg) emptyMsg.style.display = '';
    } else {
      if (emptyMsg) emptyMsg.style.display = 'none';
      for (const tx of sorted) {
        const li = document.createElement('li');
        li.className = 'transaction-item';
        li.dataset.id = tx.id;

        const displayName = tx.name.length > 50 ? tx.name.slice(0, 50) + '…' : tx.name;
        const amountStr = formatAmount(tx);

        li.innerHTML = `
          <div class="transaction-info">
            <div class="transaction-name">${escapeHtml(displayName)}</div>
            <div class="transaction-meta">${capitalize(tx.type)} &middot; ${escapeHtml(formatCategoryLabel(tx.category))}</div>
          </div>
          <span class="transaction-amount ${tx.type}">${escapeHtml(amountStr)}</span>
          <button class="btn-delete" data-id="${escapeHtml(tx.id)}" aria-label="Delete ${escapeHtml(displayName)}">Delete</button>
        `;
        listEl.appendChild(li);
      }
    }
  }

  // --- Chart ---
  const emptyChartMsg = document.getElementById('empty-chart-msg');
  const totals = calcCategoryTotals(transactions);
  const chartEntries = Object.entries(totals).filter(([, v]) => v > 0);

  if (chartEntries.length === 0) {
    if (emptyChartMsg) emptyChartMsg.style.display = '';
    const canvas = document.getElementById('expense-chart');
    if (canvas) canvas.style.display = 'none';
  } else {
    if (emptyChartMsg) emptyChartMsg.style.display = 'none';
    const canvas = document.getElementById('expense-chart');
    if (canvas) canvas.style.display = '';

    if (chart) {
      const labelMap = {
        Food: 'Makanan',
        Transport: 'Transportasi',
        Fun: 'Hiburan',
        Work: 'Pekerjaan',
        Other: 'Lainnya',
      };

      chart.data.labels = chartEntries.map(([label]) => labelMap[label] || label);
      chart.data.datasets[0].data = chartEntries.map(([, value]) => value);
      chart.update();
    }
  }
}



function initChart() {
  if (typeof Chart === 'undefined') {
    const msg = document.getElementById('empty-chart-msg');
    if (msg) msg.textContent = 'Chart unavailable (CDN failed to load).';
    return;
  }

  const canvas = document.getElementById('expense-chart');
  if (!canvas) return;

  chart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: ['#4f46e5', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6'],
        borderWidth: 2,
        borderColor: '#ffffff',
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
      },
    },
  });

  canvas.style.display = 'none';
}

/**
 * @param {Event} event
 */
function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const errorsEl = document.getElementById('form-errors');
  const amountInput = document.getElementById('amount');

  const data = {
    name: form.elements['name'].value,
    amount: amountInput ? amountInput.value.replace(/[^\d]/g, '') : form.elements['amount'].value,
    type: form.elements['type'].value,
    category: form.elements['category'].value,
    customCategory: form.elements['customCategory'] ? form.elements['customCategory'].value : '',
  };

  const { valid, errors } = validateForm(data);

  if (!valid) {
    if (errorsEl) {
      errorsEl.innerHTML = errors.map(e => `<p>${escapeHtml(e)}</p>`).join('');
    }
    return;
  }

  if (errorsEl) errorsEl.innerHTML = '';

  addTransaction({
    name: data.name.trim(),
    amount: Number(data.amount),
    type: data.type,
    category: data.category === 'Other' ? data.customCategory.trim() : data.category,
  });

  render();
  form.reset();
  if (amountInput) amountInput.value = '';
}

/** 
 * @param {string} id
 */
function handleDelete(id) {
  deleteTransaction(id);
  render();
}


/** @param {string} str */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** @param {string} str */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}


document.addEventListener('DOMContentLoaded', () => {
  initChart();
  render();

  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('expense-theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    if (themeToggle) {
      themeToggle.textContent = '☀️ Light Mode';
      themeToggle.setAttribute('aria-pressed', 'true');
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark-mode');
      localStorage.setItem('expense-theme', isDark ? 'dark' : 'light');
      themeToggle.textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
      themeToggle.setAttribute('aria-pressed', String(isDark));
    });
  }

  const amountInput = document.getElementById('amount');
  if (amountInput) {
    amountInput.addEventListener('input', (event) => {
      const caret = event.target.selectionStart;
      const value = event.target.value;
      const formatted = formatNumberInput(value);
      event.target.value = formatted;
      const newCaret = Math.min(caret, formatted.length);
      event.target.setSelectionRange(newCaret, newCaret);
    });
  }

  const categorySelect = document.getElementById('category');
  const customCategoryGroup = document.getElementById('custom-category-group');
  const customCategoryInput = document.getElementById('custom-category');

  function toggleCustomCategory() {
    if (!customCategoryGroup || !customCategoryInput) return;
    const show = categorySelect && categorySelect.value === 'Other';
    customCategoryGroup.style.display = show ? '' : 'none';
    if (!show) {
      customCategoryInput.value = '';
    }
  }

  if (categorySelect) {
    categorySelect.addEventListener('change', toggleCustomCategory);
  }
  toggleCustomCategory();

  const filterType = document.getElementById('filter-type');
  const sortBy = document.getElementById('sort-by');
  [filterType, sortBy].forEach((control) => {
    if (control) {
      control.addEventListener('change', render);
    }
  });

  // Wire up form submit
  const form = document.getElementById('transaction-form');
  if (form) form.addEventListener('submit', handleSubmit);

  // Wire up delete via event delegation on the list
  const listEl = document.getElementById('transaction-list');
  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-delete');
      if (btn) handleDelete(btn.dataset.id);
    });
  }
});
