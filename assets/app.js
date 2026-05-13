const data = window.dashboardData;
const state = {
  preset: "30",
  group: "day",
  category: "all",
  metric: "revenue",
  start: data.days[0]?.date ?? "",
  end: data.days[data.days.length - 1]?.date ?? "",
  tableFilters: {},
  tableSorts: {}
};

let activeTooltipCleanup = null;

const rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const weekdayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatMoney(value) {
  return `${rub.format(Math.round(value || 0))} ₽`;
}

function formatNumber(value) {
  return rub.format(Math.round(value || 0));
}

function formatPct(value) {
  return `${num1.format(value || 0)}%`;
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`);
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function endOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() + (7 - day));
  return copy;
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - (day - 1));
  return copy;
}

function weekdayIndex(dateValue) {
  const day = parseDate(dateValue).getDay();
  return day === 0 ? 6 : day - 1;
}

function groupLabel(start, end) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(start.getDate())}.${pad(start.getMonth() + 1)}-${pad(end.getDate())}.${pad(end.getMonth() + 1)}`;
}

function categoryList() {
  const set = new Set();
  for (const day of data.days) {
    for (const product of day.products) set.add(product.category);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
}

function applyPreset(days) {
  const last = parseDate(days[days.length - 1].date);
  if (state.preset === "all") {
    state.start = days[0].date;
    state.end = days[days.length - 1].date;
    return;
  }
  const span = Number(state.preset);
  const start = new Date(last);
  start.setDate(last.getDate() - span + 1);
  state.start = iso(start < parseDate(days[0].date) ? parseDate(days[0].date) : start);
  state.end = days[days.length - 1].date;
}

function productsForDay(day, category) {
  return category === "all" ? day.products : day.products.filter((item) => item.category === category);
}

function filteredDays() {
  const start = parseDate(state.start);
  const end = parseDate(state.end);
  return data.days
    .filter((day) => {
      const current = parseDate(day.date);
      return current >= start && current <= end;
    })
    .map((day) => {
      if (state.category === "all") return { ...day };
      const items = productsForDay(day, state.category);
      const revenue = items.reduce((sum, item) => sum + item.revenue, 0);
      const qty = items.reduce((sum, item) => sum + item.qty, 0);
      const gross = items.reduce((sum, item) => sum + item.gross, 0);
      const cost = items.reduce((sum, item) => sum + item.cost, 0);
      return {
        ...day,
        products: items,
        revenue,
        qty,
        gross,
        cost,
        payroll: 0,
        staff: items.reduce((sum, item) => sum + (item.staffQty || 0), 0),
        writeOffs: 0,
        net: gross
      };
    });
}

function groupedRows(days) {
  if (state.group === "day") return days;
  const buckets = new Map();
  for (const day of days) {
    const start = startOfWeek(parseDate(day.date));
    const end = endOfWeek(parseDate(day.date));
    const key = iso(start);
    if (!buckets.has(key)) {
      buckets.set(key, {
        date: key,
        label: groupLabel(start, end),
        revenue: 0,
        qty: 0,
        gross: 0,
        cost: 0,
        payroll: 0,
        staff: 0,
        writeOffs: 0,
        net: 0,
        products: []
      });
    }
    const bucket = buckets.get(key);
    bucket.revenue += day.revenue;
    bucket.qty += day.qty;
    bucket.gross += day.gross;
    bucket.cost += day.cost;
    bucket.payroll += day.payroll;
    bucket.staff += day.staff;
    bucket.writeOffs += day.writeOffs;
    bucket.net += day.net;
    bucket.products.push(...day.products);
  }
  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function totals(days) {
  const revenue = days.reduce((sum, day) => sum + day.revenue, 0);
  const qty = days.reduce((sum, day) => sum + day.qty, 0);
  const gross = days.reduce((sum, day) => sum + day.gross, 0);
  const payroll = days.reduce((sum, day) => sum + day.payroll, 0);
  const net = days.reduce((sum, day) => sum + day.net, 0);
  const staff = days.reduce((sum, day) => sum + day.staff, 0);
  return {
    revenue,
    qty,
    gross,
    payroll,
    net,
    staff,
    avgCheck: qty > 0 ? revenue / qty : 0,
    margin: revenue > 0 ? (gross / revenue) * 100 : 0
  };
}

function topCategories(days) {
  const map = new Map();
  for (const day of days) {
    for (const item of day.products) {
      const current = map.get(item.category) || { category: item.category, revenue: 0, qty: 0, gross: 0 };
      current.revenue += item.revenue;
      current.qty += item.qty;
      current.gross += item.gross;
      map.set(item.category, current);
    }
  }
  return Array.from(map.values())
    .map((item) => ({ ...item, margin: item.revenue > 0 ? (item.gross / item.revenue) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

function topProducts(days) {
  const map = new Map();
  for (const day of days) {
    for (const item of day.products) {
      const current = map.get(item.name) || {
        name: item.name,
        category: item.category,
        revenue: 0,
        qty: 0,
        gross: 0
      };
      current.revenue += item.revenue;
      current.qty += item.qty;
      current.gross += item.gross;
      map.set(item.name, current);
    }
  }
  return Array.from(map.values())
    .map((item) => ({ ...item, margin: item.revenue > 0 ? (item.gross / item.revenue) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

function selectedMetric(seriesItem) {
  if (state.metric === "gross") return seriesItem.gross;
  if (state.metric === "qty") return seriesItem.qty;
  if (state.metric === "net") return seriesItem.net;
  return seriesItem.revenue;
}

function metricTitle() {
  return {
    revenue: "Выручка",
    gross: "Валовая прибыль",
    qty: "Продано, шт",
    net: "Итог дня"
  }[state.metric];
}

function tooltipMetricLabel() {
  return {
    revenue: "Выручка",
    gross: "Валовая прибыль",
    qty: "Продано, шт",
    net: "Итог"
  }[state.metric];
}

function trend(current, previous) {
  if (!previous || Math.abs(previous) < 0.001) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values) {
  if (values.length < 2) return 0;
  const avg = average(values);
  const variance = average(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  const weight = index - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function weekdayRows(days) {
  const rows = weekdayNames.map((label) => ({
    label,
    revenue: 0,
    qty: 0,
    gross: 0,
    net: 0,
    payroll: 0,
    days: 0
  }));
  for (const day of days) {
    const row = rows[weekdayIndex(day.date)];
    row.revenue += day.revenue;
    row.qty += day.qty;
    row.gross += day.gross;
    row.net += day.net;
    row.payroll += day.payroll;
    row.days += 1;
  }
  return rows.map((row) => ({
    ...row,
    avgRevenue: row.days ? row.revenue / row.days : 0,
    avgNet: row.days ? row.net / row.days : 0,
    margin: row.revenue ? (row.gross / row.revenue) * 100 : 0
  }));
}

function buildRisks(days, summary, categories, products) {
  const list = [];
  const latest = days[days.length - 1];
  if (!latest) return list;
  if (state.category === "all" && latest.net < 0) {
    list.push({
      level: "critical",
      title: "Последний день в минусе",
      text: `${latest.label}: ${formatMoney(latest.net)}.`,
      advice: "Проверьте фонд оплаты, стаф, скидки и товары с просевшей валовой прибылью именно за этот день."
    });
  }
  if (state.category === "all" && summary.revenue > 0) {
    const payrollShare = (summary.payroll / summary.revenue) * 100;
    if (payrollShare > 55) {
      list.push({
        level: "critical",
        title: "ЗП фонд слишком тяжелый",
        text: `В выбранном периоде зарплата съедает ${formatPct(payrollShare)} выручки.`,
        advice: "Сверьте штатное расписание со слабыми днями недели и часами спада."
      });
    }
  }
  if (summary.margin < 50) {
    list.push({
      level: "warning",
      title: "Маржа просела",
      text: `Средняя валовая маржа периода ${formatPct(summary.margin)}.`,
      advice: "Посмотрите блюда, где себестоимость растет быстрее цены, и проверьте состав акций."
    });
  }
  if (categories[0] && categories[0].revenue > summary.revenue * 0.55) {
    list.push({
      level: "warning",
      title: "Высокая концентрация выручки",
      text: `${categories[0].category} дает ${formatPct((categories[0].revenue / summary.revenue) * 100)} выручки периода.`,
      advice: "Если спрос на эту категорию качнется, общая выручка почувствует это слишком сильно."
    });
  }
  const weakProduct = products.find((item) => item.revenue > summary.revenue * 0.025 && item.margin < 28);
  if (weakProduct) {
    list.push({
      level: "warning",
      title: "Есть товар, который ест прибыль",
      text: `${weakProduct.name}: выручка ${formatMoney(weakProduct.revenue)}, маржа ${formatPct(weakProduct.margin)}.`,
      advice: "Проверьте цену, граммовку, себестоимость или роль этой позиции в акциях."
    });
  }
  if (!list.length) {
    list.push({
      level: "ok",
      title: "Период выглядит ровно",
      text: "Сильных отклонений по текущим правилам не видно.",
      advice: "Можно спокойно углубляться в ассортимент и точки роста, а не тушить операционные сбои."
    });
  }
  return list.slice(0, 5);
}

function buildAnomalies(days, grouped, categories, products, summary) {
  const list = [];
  const latest = grouped[grouped.length - 1];
  if (!latest) return list;

  const metricValues = grouped.map(selectedMetric);
  const avgMetric = average(metricValues);
  const deviation = stddev(metricValues);
  const latestValue = selectedMetric(latest);
  const z = deviation > 0 ? (latestValue - avgMetric) / deviation : 0;
  if (Math.abs(z) >= 1.6) {
    list.push({
      level: z > 0 ? "ok" : "warning",
      title: z > 0 ? "Сильный всплеск метрики" : "Нетипичная просадка метрики",
      text: `${metricTitle()} за ${latest.label} отклонилась от нормы периода, z-score ${num1.format(z)}.`,
      detail: z > 0 ? "Это может быть удачный трафик, разовая акция или сильный состав смены." : "Проверьте смену, наличие ключевых позиций и любые сбои в учете."
    });
  }

  const revenueSeries = days.map((day) => day.revenue);
  const revAvg = average(revenueSeries);
  const revStd = stddev(revenueSeries);
  const revenueOutliers = days
    .map((day) => ({
      ...day,
      z: revStd > 0 ? (day.revenue - revAvg) / revStd : 0
    }))
    .filter((day) => Math.abs(day.z) >= 1.7)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 2);
  for (const day of revenueOutliers) {
    list.push({
      level: day.z > 0 ? "ok" : "warning",
      title: day.z > 0 ? "День выше обычного" : "День ниже обычного",
      text: `${day.label}: выручка ${formatMoney(day.revenue)}, отклонение ${formatPct(Math.abs(day.z) * 100 / 2)} от типичного ритма.`,
      detail: day.z > 0 ? "Стоит повторить те действия, которые сработали именно в этот день." : "Сверьте трафик, промо и провалившуюся категорию."
    });
  }

  const weakCategory = categories.find((item) => item.margin < 45 && item.revenue > summary.revenue * 0.08);
  if (weakCategory) {
    list.push({
      level: "warning",
      title: "Категория с просевшей маржой",
      text: `${weakCategory.category}: маржа ${formatPct(weakCategory.margin)} при выручке ${formatMoney(weakCategory.revenue)}.`,
      detail: "Здесь уже есть смысл смотреть рецепт, скидки, порционность и долю списаний."
    });
  }

  const weakProduct = products.find((item) => item.margin < 25 && item.revenue > summary.revenue * 0.03);
  if (weakProduct) {
    list.push({
      level: "warning",
      title: "Товар с тревожной экономикой",
      text: `${weakProduct.name}: маржа ${formatPct(weakProduct.margin)} при выручке ${formatMoney(weakProduct.revenue)}.`,
      detail: "Если позиция популярная, она может заметно съедать прибыль всей точки."
    });
  }

  if (!list.length) {
    list.push({
      level: "ok",
      title: "Аномалии не выбиваются",
      text: "По выбранному периоду ритм продаж выглядит довольно ровным.",
      detail: "Хороший момент копать уже глубже в управленческие решения и доработку меню."
    });
  }
  return list.slice(0, 6);
}

function buildAdvice(days, grouped, categories, products, summary) {
  const tips = [];
  const latest = days[days.length - 1];
  const topCategory = categories[0];
  const topProduct = products[0];
  const weekdays = weekdayRows(days).filter((item) => item.days > 0);
  const strongestWeekday = [...weekdays].sort((a, b) => b.avgRevenue - a.avgRevenue)[0];
  const weakestWeekday = [...weekdays].sort((a, b) => a.avgRevenue - b.avgRevenue)[0];

  if (state.category === "all" && summary.payroll > 0 && summary.revenue > 0) {
    const payrollShare = (summary.payroll / summary.revenue) * 100;
    if (payrollShare > 50) {
      tips.push({
        title: "Поджать фонд смен",
        text: `ЗП фонд занимает ${formatPct(payrollShare)} выручки периода. Перенесите сильный состав на часы и дни, которые реально тянут кассу.`
      });
    }
  }

  if (summary.margin < 55) {
    tips.push({
      title: "Поднять маржу в точках объема",
      text: `Средняя маржа ${formatPct(summary.margin)}. Ищите позиции, где выручка большая, а валовая прибыль ниже нормы, и правьте цену или состав.`
    });
  }

  if (topCategory) {
    tips.push({
      title: "Усилить лидирующую категорию",
      text: `${topCategory.category} уже дает ${formatPct((topCategory.revenue / Math.max(summary.revenue, 1)) * 100)} выручки. Допродажи и промо лучше строить вокруг нее.`
    });
  }

  if (topProduct) {
    tips.push({
      title: "Зафиксировать опору на хит продаж",
      text: `${topProduct.name} приносит ${formatMoney(topProduct.revenue)}. Для этой позиции критичны наличие ингредиентов, скорость сборки и видимость в продаже.`
    });
  }

  if (strongestWeekday && weakestWeekday && strongestWeekday.label !== weakestWeekday.label) {
    tips.push({
      title: "Планировать неделю неравномерно",
      text: `${strongestWeekday.label} заметно сильнее, чем ${weakestWeekday.label}. Это повод разводить промо, персонал и подготовку по дням, а не средним по месяцу.`
    });
  }

  const lossDays = days.filter((day) => day.net < 0).length;
  if (state.category === "all" && lossDays >= Math.ceil(days.length * 0.6)) {
    tips.push({
      title: "Смотреть не только на выручку",
      text: `Отрицательный итог был в ${lossDays} из ${days.length} дней периода. Точка роста сейчас в операционке: смены, себестоимость, промо и дисциплина стафа.`
    });
  }

  const weakProducts = products.filter((item) => item.margin < 35).slice(0, 3);
  if (weakProducts.length) {
    tips.push({
      title: "Пересмотреть слабые позиции",
      text: `На разбор просятся: ${weakProducts.map((item) => item.name).join(", ")}. У них уже заметная выручка, но слабая маржинальность.`
    });
  }

  if (latest && latest.revenue < average(days.map((day) => day.revenue)) * 0.9) {
    tips.push({
      title: "Разобрать последний день отдельно",
      text: `${latest.label} слабее среднего по периоду. Сверьте трафик, списания, стаф, загрузку кухни и наличие ключевых позиций.`
    });
  }

  return tips.slice(0, 7);
}

function buildDeepMetrics(days, grouped, categories, products, summary) {
  const revenueValues = days.map((day) => day.revenue);
  const netValues = days.map((day) => day.net);
  const avgRevenue = average(revenueValues);
  const volatility = avgRevenue ? (stddev(revenueValues) / avgRevenue) * 100 : 0;
  const p90 = percentile(revenueValues, 0.9);
  const p10 = percentile(revenueValues, 0.1);
  const concentration = categories[0] ? (categories[0].revenue / Math.max(summary.revenue, 1)) * 100 : 0;
  const marginLeaders = products.filter((item) => item.revenue > summary.revenue * 0.015).sort((a, b) => b.margin - a.margin).slice(0, 3);
  const weakProducts = products.filter((item) => item.revenue > summary.revenue * 0.015).sort((a, b) => a.margin - b.margin).slice(0, 3);
  const positiveDays = days.filter((day) => day.net >= 0).length;
  const lossDays = days.length - positiveDays;
  const bestGrouped = [...grouped].sort((a, b) => selectedMetric(b) - selectedMetric(a))[0];
  const worstGrouped = [...grouped].sort((a, b) => selectedMetric(a) - selectedMetric(b))[0];
  return {
    avgRevenue,
    volatility,
    p90,
    p10,
    concentration,
    positiveDays,
    lossDays,
    avgNet: average(netValues),
    marginLeaders,
    weakProducts,
    bestGrouped,
    worstGrouped
  };
}

function lineChart(series) {
  const width = 760;
  const height = 320;
  const padX = 46;
  const padY = 26;
  if (!series.length) return `<svg class="chart" viewBox="0 0 ${width} ${height}"></svg>`;
  const values = series.map(selectedMetric);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = Math.max(1, max - min);
  const points = series.map((item, index) => {
    const x = padX + index * ((width - padX * 2) / Math.max(1, series.length - 1));
    const value = selectedMetric(item);
    const y = height - padY - ((value - min) / span) * (height - padY * 2);
    return { x, y, label: item.label, value, item };
  });
  const poly = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = [`${points[0].x.toFixed(1)},${height - padY}`]
    .concat(points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`))
    .concat(`${points[points.length - 1].x.toFixed(1)},${height - padY}`)
    .join(" ");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((step) => {
    const value = min + span * step;
    const y = height - padY - step * (height - padY * 2);
    return `<line class="grid-line" x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}"></line>
      <text x="6" y="${y + 4}">${rub.format(Math.round(value))}</text>`;
  }).join("");
  const dots = points.map((p) => `<circle class="dot" cx="${p.x}" cy="${p.y}" r="4.5"></circle>`).join("");
  const labels = points.map((p, index) => {
    if (series.length > 10 && index % Math.ceil(series.length / 6) !== 0 && index !== points.length - 1) return "";
    return `<text x="${p.x}" y="${height - 8}" text-anchor="middle">${p.label}</text>`;
  }).join("");
  const pointPayload = points.map((point) => ({
    x: point.x,
    label: point.label,
    value: point.value,
    revenue: point.item.revenue,
    gross: point.item.gross,
    qty: point.item.qty,
    net: point.item.net
  }));
  return `<svg class="chart js-chart" data-chart-type="line" data-chart-metric="${state.metric}" data-points='${escapeHtml(JSON.stringify(pointPayload))}' viewBox="0 0 ${width} ${height}">
    ${grid}
    <line class="axis" x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}"></line>
    <line class="chart-guideline" x1="${padX}" y1="${padY}" x2="${padX}" y2="${height - padY}" style="display:none"></line>
    <polygon class="series-area" points="${area}"></polygon>
    <polyline class="series-line" points="${poly}"></polyline>
    ${dots}
    ${labels}
    <rect class="chart-overlay" x="${padX}" y="${padY}" width="${width - padX * 2}" height="${height - padY * 2}"></rect>
  </svg>`;
}

function dualMetricChart(series) {
  const width = 760;
  const height = 360;
  const padX = 46;
  const padY = 26;
  if (!series.length) return `<svg class="chart tall" viewBox="0 0 ${width} ${height}"></svg>`;
  const marginValues = series.map((item) => item.revenue > 0 ? (item.gross / item.revenue) * 100 : 0);
  const netValues = series.map((item) => item.net);
  const marginMin = Math.min(...marginValues, 0);
  const marginMax = Math.max(...marginValues, 1);
  const netMin = Math.min(...netValues, 0);
  const netMax = Math.max(...netValues, 1);
  const spanMargin = Math.max(1, marginMax - marginMin);
  const spanNet = Math.max(1, netMax - netMin);
  const marginPoints = series.map((item, index) => {
    const x = padX + index * ((width - padX * 2) / Math.max(1, series.length - 1));
    const value = item.revenue > 0 ? (item.gross / item.revenue) * 100 : 0;
    const y = height - padY - ((value - marginMin) / spanMargin) * (height - padY * 2);
    return { x, y, label: item.label };
  });
  const zeroY = height - padY - ((0 - netMin) / spanNet) * (height - padY * 2);
  const barWidth = Math.max(10, (width - padX * 2) / Math.max(series.length * 1.7, 8));
  const payload = [];
  const bars = series.map((item, index) => {
    const x = padX + index * ((width - padX * 2) / Math.max(1, series.length - 1)) - barWidth / 2;
    const y = height - padY - ((item.net - netMin) / spanNet) * (height - padY * 2);
    const top = Math.min(y, zeroY);
    const barHeight = Math.abs(zeroY - y);
    payload.push({
      x: padX + index * ((width - padX * 2) / Math.max(1, series.length - 1)),
      label: item.label,
      revenue: item.revenue,
      gross: item.gross,
      qty: item.qty,
      net: item.net,
      margin: item.revenue > 0 ? (item.gross / item.revenue) * 100 : 0
    });
    return `<rect class="bar ${item.net < 0 ? "negative" : ""}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(barHeight, 2).toFixed(1)}" rx="7"></rect>`;
  }).join("");
  const poly = marginPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const dots = marginPoints.map((p) => `<circle class="dot secondary" cx="${p.x}" cy="${p.y}" r="4.5"></circle>`).join("");
  const labels = marginPoints.map((p, index) => {
    if (series.length > 10 && index % Math.ceil(series.length / 6) !== 0 && index !== marginPoints.length - 1) return "";
    return `<text x="${p.x}" y="${height - 8}" text-anchor="middle">${p.label}</text>`;
  }).join("");
  const leftScale = [0, 0.25, 0.5, 0.75, 1].map((step) => {
    const value = marginMin + spanMargin * step;
    const y = height - padY - step * (height - padY * 2);
    return `<text x="6" y="${y + 4}">${num1.format(value)}%</text>`;
  }).join("");
  const rightScale = [0, 0.25, 0.5, 0.75, 1].map((step) => {
    const value = netMin + spanNet * step;
    const y = height - padY - step * (height - padY * 2);
    return `<text x="${width - 4}" y="${y + 4}" text-anchor="end">${rub.format(Math.round(value))}</text>`;
  }).join("");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((step) => {
    const y = height - padY - step * (height - padY * 2);
    return `<line class="grid-line" x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}"></line>`;
  }).join("");
  return `<svg class="chart tall js-chart" data-chart-type="dual" data-chart-metric="${state.metric}" data-points='${escapeHtml(JSON.stringify(payload))}' viewBox="0 0 ${width} ${height}">
    ${grid}
    <line class="axis" x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}"></line>
    <line class="axis" x1="${padX}" y1="${zeroY}" x2="${width - padX}" y2="${zeroY}"></line>
    <line class="chart-guideline" x1="${padX}" y1="${padY}" x2="${padX}" y2="${height - padY}" style="display:none"></line>
    ${leftScale}
    ${rightScale}
    ${bars}
    <polyline class="series-line secondary" points="${poly}"></polyline>
    ${dots}
    ${labels}
    <rect class="chart-overlay" x="${padX}" y="${padY}" width="${width - padX * 2}" height="${height - padY * 2}"></rect>
  </svg>`;
}

function barChart(categories) {
  if (!categories.length) return `<div class="bars"></div>`;
  const max = categories[0].revenue || 1;
  return `<div class="bars">${categories.slice(0, 6).map((item) => {
    const width = (item.revenue / max) * 100;
    return `<div class="bar-row">
      <div class="bar-label"><span>${item.category}</span><strong>${formatMoney(item.revenue)}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
      <span class="muted">Маржа ${formatPct(item.margin)} · ${formatNumber(item.qty)} шт</span>
    </div>`;
  }).join("")}</div>`;
}

function weekdayChart(rows) {
  const filtered = rows.filter((row) => row.days > 0);
  if (!filtered.length) return `<div class="bars"></div>`;
  const maxRevenue = Math.max(...filtered.map((row) => row.avgRevenue), 1);
  return `<div class="bars">${filtered.map((row) => `
    <div class="bar-row">
      <div class="bar-label">
        <span>${row.label}</span>
        <strong>${formatMoney(row.avgRevenue)}</strong>
      </div>
      <div class="bar-track"><div class="bar-fill alt" style="width:${(row.avgRevenue / maxRevenue) * 100}%"></div></div>
      <span class="muted">Средний итог дня ${formatMoney(row.avgNet)} · маржа ${formatPct(row.margin)}</span>
    </div>
  `).join("")}</div>`;
}

function buildPills(days, summary, categories, grouped) {
  const pills = [];
  const losingDaysShare = days.length ? (days.filter((day) => day.net < 0).length / days.length) * 100 : 0;
  pills.push(`Маржа периода ${formatPct(summary.margin)}`);
  pills.push(`Минусовых дней ${formatPct(losingDaysShare)}`);
  if (categories[0]) pills.push(`Лидер ${categories[0].category}`);
  if (grouped.length > 1) pills.push(`${state.group === "day" ? "Точек" : "Недель"} ${grouped.length}`);
  return pills;
}

function getTableFilters(tableId, columns) {
  if (!state.tableFilters[tableId]) {
    state.tableFilters[tableId] = {};
  }
  for (const column of columns) {
    if (!(column.key in state.tableFilters[tableId])) {
      state.tableFilters[tableId][column.key] = "";
    }
  }
  return state.tableFilters[tableId];
}

function getTableSort(tableId, columns) {
  if (!state.tableSorts[tableId]) {
    state.tableSorts[tableId] = {
      key: columns.find((column) => column.sortable !== false)?.key ?? columns[0]?.key ?? "",
      dir: "desc"
    };
  }
  return state.tableSorts[tableId];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyColumnFilters(rows, filters, columns) {
  return rows.filter((row) =>
    columns.every((column) => {
      const query = (filters[column.key] || "").trim().toLowerCase();
      if (!query) return true;
      const raw = column.filterValue ? column.filterValue(row) : row[column.key];
      if (column.type === "number") {
        const numericValue = Number(column.numericValue ? column.numericValue(row) : raw);
        if (!Number.isNaN(numericValue)) {
          const match = query.match(/^(>=|<=|>|<|=)\s*(-?\d+(?:[.,]\d+)?)$/);
          if (match) {
            const op = match[1];
            const target = Number(match[2].replace(",", "."));
            if (op === ">") return numericValue > target;
            if (op === "<") return numericValue < target;
            if (op === ">=") return numericValue >= target;
            if (op === "<=") return numericValue <= target;
            if (op === "=") return numericValue === target;
          }
        }
      }
      return String(raw ?? "").toLowerCase().includes(query);
    })
  );
}

function sortRows(rows, sortState, columns) {
  const column = columns.find((item) => item.key === sortState.key) || columns[0];
  if (!column) return rows;
  const direction = sortState.dir === "asc" ? 1 : -1;
  const resolver = column.sortValue || column.numericValue || column.filterValue || ((row) => row[column.key]);
  return [...rows].sort((a, b) => {
    const av = resolver(a);
    const bv = resolver(b);
    if (column.type === "number") {
      return (Number(av) - Number(bv)) * direction;
    }
    return String(av ?? "").localeCompare(String(bv ?? ""), "ru", { sensitivity: "base" }) * direction;
  });
}

function renderFilterableTable(tableId, columns, rows) {
  const filters = getTableFilters(tableId, columns);
  const sortState = getTableSort(tableId, columns);
  const filteredRows = applyColumnFilters(rows, filters, columns);
  const sortedRows = sortRows(filteredRows, sortState, columns);
  const headerRow = `<tr>${columns.map((column) => {
    const sortable = column.sortable !== false;
    const active = sortState.key === column.key;
    const arrow = !sortable ? "" : `<span class="sort-indicator">${active ? (sortState.dir === "asc" ? "▲" : "▼") : "↕"}</span>`;
    return `<th class="${sortable ? "sortable-header" : ""}" ${sortable ? `data-sort-table="${tableId}" data-sort-key="${column.key}"` : ""}>${column.label}${arrow}</th>`;
  }).join("")}</tr>`;
  const filterRow = `<tr class="filter-row">${columns.map((column) => `
    <th>
      <input
        class="column-filter"
        data-table-filter="${tableId}"
        data-filter-key="${column.key}"
        type="text"
        value="${escapeHtml(filters[column.key] || "")}"
        placeholder="Фильтр"
      >
      ${column.type === "number" ? `<span class="filter-hint">Можно: >, <, >=, <=, =</span>` : ""}
    </th>
  `).join("")}</tr>`;
  const bodyRows = sortedRows.length
    ? sortedRows.map((row) => `<tr>${columns.map((column) => `<td>${column.render(row)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}"><span class="muted">Нет строк по текущему фильтру.</span></td></tr>`;
  return `<div class="table-wrap"><table class="table">${headerRow}${filterRow}${bodyRows}</table></div>`;
}

function render() {
  const days = filteredDays();
  const grouped = groupedRows(days);
  if (!days.length) {
    document.getElementById("app").innerHTML = `<section class="panel"><h2>Нет данных</h2><p class="muted">В выбранном диапазоне нет листов с продажами.</p></section>`;
    return;
  }
  const summary = totals(days);
  const categories = topCategories(days);
  const products = topProducts(days);
  const weekdays = weekdayRows(days);
  const deep = buildDeepMetrics(days, grouped, categories, products, summary);
  const rangeChange = grouped.length > 1 ? trend(selectedMetric(grouped[grouped.length - 1]), selectedMetric(grouped[grouped.length - 2])) : null;
  const bestDay = [...days].sort((a, b) => b.revenue - a.revenue)[0];
  const bestNet = [...days].sort((a, b) => b.net - a.net)[0];
  const worstNet = [...days].sort((a, b) => a.net - b.net)[0];
  const riskItems = buildRisks(days, summary, categories, products);
  const anomalyItems = buildAnomalies(days, grouped, categories, products, summary);
  const adviceItems = buildAdvice(days, grouped, categories, products, summary);
  const pills = buildPills(days, summary, categories, grouped);

  document.getElementById("app").innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <span class="hero-note">Операционный дашборд для вашей блинной</span>
        <h2>Темный режим, больше сигналов и глубже управленческая аналитика.</h2>
        <p>Дашборд считает выручку, валовую прибыль, итог дня, аномалии, устойчивость спроса, ритм по дням недели и зоны, где деньги есть, но экономика уже начинает проседать.</p>
        <div class="stat-row">
          <div class="stat-chip"><span class="muted">Период</span><strong>${days[0].label} - ${days[days.length - 1].label}</strong></div>
          <div class="stat-chip"><span class="muted">Листов</span><strong>${days.length}</strong></div>
          <div class="stat-chip"><span class="muted">Последний день</span><strong>${data.lastDay}</strong></div>
        </div>
        <div class="pill-row">${pills.map((pill) => `<span class="pill">${pill}</span>`).join("")}</div>
      </div>
      <div class="hero-art">
        <div class="art-caption">Глубокий срез по точке<span class="art-sub">Спрос, маржа, концентрация выручки, ритм недели и реальные действия по сменам и меню.</span></div>
        <div class="stack">
          <div class="steam s1"></div><div class="steam s2"></div>
          <div class="pancake p1"></div><div class="pancake p2"></div><div class="pancake p3"></div><div class="pancake p4"></div><div class="pancake p5"></div>
          <div class="syrup"></div>
          <div class="berry-dot b1"></div><div class="berry-dot b2"></div><div class="berry-dot b3"></div>
          <div class="leaf l1"></div><div class="leaf l2"></div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div class="control">
          <label>Период</label>
          <div class="segmented" id="preset-buttons">
            <button data-preset="7">7 дней</button>
            <button data-preset="14">14 дней</button>
            <button data-preset="30">30 дней</button>
            <button data-preset="all">Весь период</button>
          </div>
        </div>
        <div class="control">
          <label>Группировка</label>
          <select id="group-select">
            <option value="day">По дням</option>
            <option value="week">По неделям</option>
          </select>
        </div>
        <div class="control">
          <label>Метрика</label>
          <select id="metric-select">
            <option value="revenue">Выручка</option>
            <option value="gross">Валовая прибыль</option>
            <option value="qty">Продано, шт</option>
            <option value="net">Итог дня</option>
          </select>
        </div>
        <div class="control">
          <label>Категория</label>
          <select id="category-select">
            <option value="all">Все категории</option>
            ${categoryList().map((category) => `<option value="${category}">${category}</option>`).join("")}
          </select>
        </div>
        <div class="control">
          <label>С</label>
          <input type="date" id="start-date" value="${state.start}">
        </div>
        <div class="control">
          <label>По</label>
          <input type="date" id="end-date" value="${state.end}">
        </div>
      </div>
    </section>

    <section class="summary">
      <article class="card"><span>Выручка периода</span><strong>${formatMoney(summary.revenue)}</strong><span>${rangeChange === null ? "без сравнения" : `${formatPct(rangeChange)} к предыдущей точке`}</span></article>
      <article class="card"><span>Валовая прибыль</span><strong>${formatMoney(summary.gross)}</strong><span>маржа ${formatPct(summary.margin)}</span></article>
      <article class="card"><span>Продано порций</span><strong>${formatNumber(summary.qty)}</strong><span>средний чек ${formatMoney(summary.avgCheck)}</span></article>
      <article class="card"><span>Итог периода</span><strong class="${summary.net < 0 ? "bad" : "good"}">${formatMoney(summary.net)}</strong><span>${state.category === "all" ? `ЗП фонд ${formatMoney(summary.payroll)}` : "без распределения зарплаты"}</span></article>
      <article class="card"><span>Средняя выручка дня</span><strong>${formatMoney(deep.avgRevenue)}</strong><span>волатильность ${formatPct(deep.volatility)}</span></article>
    </section>

    <section class="metric-cards">
      <article class="metric-card"><span>Диапазон сильных дней</span><strong>${formatMoney(deep.p90)}</strong><span class="sub">90-й перцентиль выручки. Это уровень дней, на которые стоит равняться по трафику и составу смены.</span></article>
      <article class="metric-card"><span>Слабый край периода</span><strong>${formatMoney(deep.p10)}</strong><span class="sub">10-й перцентиль. Эти дни надо разбирать по трафику, промо и часам работы.</span></article>
      <article class="metric-card"><span>Концентрация выручки</span><strong>${formatPct(deep.concentration)}</strong><span class="sub">Доля крупнейшей категории в общей кассе периода.</span></article>
      <article class="metric-card"><span>Баланс дней</span><strong>${deep.positiveDays} / ${days.length}</strong><span class="sub">${deep.lossDays} дней закрылись в минус по итогу.</span></article>
    </section>

    <section class="grid">
      <article class="panel">
        <div class="panel-head">
          <div><h3>${metricTitle()} в динамике</h3><p>${state.group === "day" ? "Каждая точка — отдельный день." : "Каждая точка — итог недели."}</p></div>
          <strong>${state.category === "all" ? "Все категории" : state.category}</strong>
        </div>
        ${lineChart(grouped)}
      </article>
      <article class="panel">
        <div class="panel-head">
          <div><h3>Ритм по дням недели</h3><p>Средняя выручка и результат по каждому дню недели.</p></div>
        </div>
        ${weekdayChart(weekdays)}
      </article>
    </section>

    <section class="grid equal">
      <article class="panel">
        <div class="panel-head">
          <div><h3>Маржа и итог по точкам</h3><p>Линия показывает маржу, столбцы — итог дня или недели.</p></div>
          <strong>${state.group === "day" ? "По дням" : "По неделям"}</strong>
        </div>
        ${dualMetricChart(grouped)}
      </article>
      <article class="panel">
        <div class="panel-head">
          <div><h3>Структура выручки</h3><p>Какие категории реально тянут период вверх.</p></div>
        </div>
        ${barChart(categories)}
      </article>
    </section>

    <section class="insights">
      <article class="insight"><span class="muted">Лучший день по выручке</span><strong>${bestDay.label}</strong><span>${formatMoney(bestDay.revenue)}</span></article>
      <article class="insight"><span class="muted">Лучший итог дня</span><strong>${bestNet.label}</strong><span class="${bestNet.net < 0 ? "bad" : "good"}">${formatMoney(bestNet.net)}</span></article>
      <article class="insight"><span class="muted">Самый тяжелый день</span><strong>${worstNet.label}</strong><span class="${worstNet.net < 0 ? "bad" : "good"}">${formatMoney(worstNet.net)}</span></article>
    </section>

    <section class="radar-grid">
      <article class="radar-card"><span>Пик по выбранной метрике</span><strong>${deep.bestGrouped ? deep.bestGrouped.label : "—"}</strong><span class="sub">${deep.bestGrouped ? `${metricTitle()} ${formatMoney(selectedMetric(deep.bestGrouped))}` : "Нет данных"}</span></article>
      <article class="radar-card"><span>Провал по выбранной метрике</span><strong>${deep.worstGrouped ? deep.worstGrouped.label : "—"}</strong><span class="sub">${deep.worstGrouped ? `${metricTitle()} ${formatMoney(selectedMetric(deep.worstGrouped))}` : "Нет данных"}</span></article>
      <article class="radar-card"><span>Лучшие товары по марже</span><strong>${deep.marginLeaders[0]?.name ?? "—"}</strong><span class="sub">${deep.marginLeaders.map((item) => `${item.name} (${formatPct(item.margin)})`).join(" · ") || "Нет данных"}</span></article>
      <article class="radar-card"><span>Слабые товары по марже</span><strong>${deep.weakProducts[0]?.name ?? "—"}</strong><span class="sub">${deep.weakProducts.map((item) => `${item.name} (${formatPct(item.margin)})`).join(" · ") || "Нет данных"}</span></article>
    </section>

    <section class="grid equal">
      <article class="panel">
        <div class="panel-head">
          <div><h3>Категории периода</h3><p>Выручка, продажи и маржа по направлениям меню.</p></div>
        </div>
        ${renderFilterableTable("categories", [
          {
            key: "category",
            label: "Категория",
            render: (item) => `${item.category}<small>Доля ${(item.revenue / Math.max(summary.revenue, 1) * 100).toFixed(1).replace(".", ",")}% выручки периода</small>`,
            sortValue: (item) => item.category
          },
          { key: "revenue", label: "Выручка", type: "number", render: (item) => formatMoney(item.revenue), filterValue: (item) => `${item.revenue} ${formatMoney(item.revenue)}`, numericValue: (item) => item.revenue },
          { key: "qty", label: "Шт", type: "number", render: (item) => formatNumber(item.qty), filterValue: (item) => `${item.qty} ${formatNumber(item.qty)}`, numericValue: (item) => item.qty },
          { key: "gross", label: "Вал", type: "number", render: (item) => formatMoney(item.gross), filterValue: (item) => `${item.gross} ${formatMoney(item.gross)}`, numericValue: (item) => item.gross },
          { key: "margin", label: "Маржа", type: "number", render: (item) => formatPct(item.margin), filterValue: (item) => `${item.margin} ${formatPct(item.margin)}`, numericValue: (item) => item.margin }
        ], categories)}
      </article>
      <article class="panel">
        <div class="panel-head">
          <div><h3>Профиль недели</h3><p>Сравнение средних дней по выручке, марже и итогу.</p></div>
        </div>
        ${renderFilterableTable("weekdays", [
          { key: "label", label: "День", render: (item) => `${item.label}<small>${item.days} наблюд. в периоде</small>`, sortValue: (item) => item.label },
          { key: "avgRevenue", label: "Средняя выручка", type: "number", render: (item) => formatMoney(item.avgRevenue), filterValue: (item) => `${item.avgRevenue} ${formatMoney(item.avgRevenue)}`, numericValue: (item) => item.avgRevenue },
          { key: "margin", label: "Маржа", type: "number", render: (item) => formatPct(item.margin), filterValue: (item) => `${item.margin} ${formatPct(item.margin)}`, numericValue: (item) => item.margin },
          { key: "avgNet", label: "Средний итог", type: "number", render: (item) => `<span class="${item.avgNet < 0 ? "bad" : "good"}">${formatMoney(item.avgNet)}</span>`, filterValue: (item) => `${item.avgNet} ${formatMoney(item.avgNet)}`, numericValue: (item) => item.avgNet }
        ], weekdays.filter((item) => item.days > 0))}
      </article>
    </section>

    <section class="grid">
      <article class="panel">
        <div class="panel-head">
          <div><h3>Риски и сигналы</h3><p>То, что уже требует внимания по выбранному диапазону.</p></div>
        </div>
        <div class="risk-grid">
          ${riskItems.map((item) => `<article class="risk ${item.level}"><span>${item.level.toUpperCase()}</span><h2>${item.title}</h2><p>${item.text}</p><p class="advice">${item.advice}</p></article>`).join("")}
        </div>
      </article>
      <article class="panel">
        <div class="panel-head">
          <div><h3>Аномалии периода</h3><p>Всплески, просадки и отклонения от обычного ритма.</p></div>
        </div>
        <div class="risk-grid">
          ${anomalyItems.map((item) => `<article class="risk ${item.level}"><span>${item.level.toUpperCase()}</span><h2>${item.title}</h2><p>${item.text}</p><p class="advice">${item.detail}</p></article>`).join("")}
        </div>
      </article>
    </section>

    <section class="grid">
      <article class="panel">
        <div class="panel-head">
          <div><h3>Рабочие советы</h3><p>Не общие фразы, а действия для смен, меню и распределения усилий.</p></div>
        </div>
        <div class="risk-grid">
          ${adviceItems.map((item) => `<article class="risk ok"><span>ACTION</span><h2>${item.title}</h2><p>${item.text}</p></article>`).join("")}
        </div>
      </article>
      <article class="panel">
        <div class="panel-head">
          <div><h3>Лидеры ассортимента</h3><p>Товары, которые дают деньги, и сразу видно, насколько они качественны по марже.</p></div>
        </div>
        ${renderFilterableTable("products", [
          {
            key: "name",
            label: "Товар",
            render: (item) => `${item.name}<small>${item.margin < 30 ? "Нужен контроль экономики" : item.margin > 60 ? "Сильная валовая модель" : "Рабочая позиция"}</small>`,
            sortValue: (item) => item.name
          },
          { key: "category", label: "Категория", render: (item) => item.category, sortValue: (item) => item.category },
          { key: "revenue", label: "Выручка", type: "number", render: (item) => formatMoney(item.revenue), filterValue: (item) => `${item.revenue} ${formatMoney(item.revenue)}`, numericValue: (item) => item.revenue },
          { key: "qty", label: "Шт", type: "number", render: (item) => formatNumber(item.qty), filterValue: (item) => `${item.qty} ${formatNumber(item.qty)}`, numericValue: (item) => item.qty },
          { key: "gross", label: "Вал", type: "number", render: (item) => formatMoney(item.gross), filterValue: (item) => `${item.gross} ${formatMoney(item.gross)}`, numericValue: (item) => item.gross },
          { key: "margin", label: "Маржа", type: "number", render: (item) => `<span class="${item.margin < 30 ? "bad" : item.margin > 60 ? "good" : ""}">${formatPct(item.margin)}</span>`, filterValue: (item) => `${item.margin} ${formatPct(item.margin)}`, numericValue: (item) => item.margin }
        ], products.slice(0, 15))}
      </article>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div><h3>${state.group === "day" ? "Дневная" : "Недельная"} аналитика</h3><p>Сводные строки по выбранной группировке для более детального чтения периода.</p></div>
      </div>
      ${renderFilterableTable("grouped", [
          {
            key: "label",
            label: state.group === "day" ? "День" : "Неделя",
            render: (item) => `${item.label}<small>${item.revenue < deep.avgRevenue * 0.8 ? "Слабее среднего периода" : item.revenue > deep.avgRevenue * 1.2 ? "Сильнее среднего периода" : "Около среднего"}</small>`,
            sortValue: (item) => item.label
          },
          { key: "revenue", label: "Выручка", type: "number", render: (item) => formatMoney(item.revenue), filterValue: (item) => `${item.revenue} ${formatMoney(item.revenue)}`, numericValue: (item) => item.revenue },
          { key: "qty", label: "Шт", type: "number", render: (item) => formatNumber(item.qty), filterValue: (item) => `${item.qty} ${formatNumber(item.qty)}`, numericValue: (item) => item.qty },
          { key: "gross", label: "Вал", type: "number", render: (item) => formatMoney(item.gross), filterValue: (item) => `${item.gross} ${formatMoney(item.gross)}`, numericValue: (item) => item.gross },
          {
            key: "margin",
            label: "Маржа",
            type: "number",
            render: (item) => formatPct(item.revenue > 0 ? (item.gross / item.revenue) * 100 : 0),
            filterValue: (item) => {
              const margin = item.revenue > 0 ? (item.gross / item.revenue) * 100 : 0;
            return `${margin} ${formatPct(margin)}`;
            }
          },
          { key: "net", label: "Итог", type: "number", render: (item) => `<span class="${item.net < 0 ? "bad" : "good"}">${formatMoney(item.net)}</span>`, filterValue: (item) => `${item.net} ${formatMoney(item.net)}`, numericValue: (item) => item.net }
      ], grouped.slice().reverse())}
    </section>

    <p class="footer-note">Сгенерировано ${data.generatedAt.replace("T", " ")}. Если выбрана конкретная категория, итог периода считается как валовая прибыль этой категории без распределения общего зарплатного фонда между категориями. Темная тема и глубокие метрики применяются ко всем страницам дашборда, включая GitHub Pages-публикацию.</p>
  `;

  bindControls();
  bindChartTooltips();
}

function bindControls() {
  document.querySelectorAll("#preset-buttons button").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === state.preset);
    button.onclick = () => {
      state.preset = button.dataset.preset;
      applyPreset(data.days);
      render();
    };
  });
  const groupSelect = document.getElementById("group-select");
  const metricSelect = document.getElementById("metric-select");
  const categorySelect = document.getElementById("category-select");
  const startInput = document.getElementById("start-date");
  const endInput = document.getElementById("end-date");
  groupSelect.value = state.group;
  metricSelect.value = state.metric;
  categorySelect.value = state.category;
  startInput.value = state.start;
  endInput.value = state.end;

  groupSelect.onchange = () => {
    state.group = groupSelect.value;
    render();
  };
  metricSelect.onchange = () => {
    state.metric = metricSelect.value;
    if (state.category !== "all" && state.metric === "net") state.metric = "gross";
    render();
  };
  categorySelect.onchange = () => {
    state.category = categorySelect.value;
    if (state.category !== "all" && state.metric === "net") state.metric = "gross";
    render();
  };
  startInput.onchange = () => {
    state.start = startInput.value;
    state.preset = "custom";
    render();
  };
  endInput.onchange = () => {
    state.end = endInput.value;
    state.preset = "custom";
    render();
  };

  document.querySelectorAll("[data-table-filter]").forEach((input) => {
    input.oninput = () => {
      const tableId = input.getAttribute("data-table-filter");
      const key = input.getAttribute("data-filter-key");
      if (!state.tableFilters[tableId]) {
        state.tableFilters[tableId] = {};
      }
      state.tableFilters[tableId][key] = input.value;
      render();
    };
  });

  document.querySelectorAll("[data-sort-table]").forEach((header) => {
    header.onclick = () => {
      const tableId = header.getAttribute("data-sort-table");
      const key = header.getAttribute("data-sort-key");
      if (!state.tableSorts[tableId]) {
        state.tableSorts[tableId] = { key, dir: "desc" };
      }
      else if (state.tableSorts[tableId].key === key) {
        state.tableSorts[tableId].dir = state.tableSorts[tableId].dir === "asc" ? "desc" : "asc";
      }
      else {
        state.tableSorts[tableId] = { key, dir: "desc" };
      }
      render();
    };
  });
}

function removeTooltip() {
  if (activeTooltipCleanup) {
    activeTooltipCleanup();
    activeTooltipCleanup = null;
  }
}

function bindChartTooltips() {
  removeTooltip();
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  document.body.appendChild(tooltip);

  function showTooltip(event, html) {
    tooltip.innerHTML = html;
    tooltip.classList.add("visible");
    const offsetX = 18;
    const offsetY = 18;
    const maxLeft = window.innerWidth - tooltip.offsetWidth - 12;
    const maxTop = window.innerHeight - tooltip.offsetHeight - 12;
    const left = Math.max(12, Math.min(event.clientX + offsetX, maxLeft));
    const top = Math.max(12, Math.min(event.clientY + offsetY, maxTop));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideTooltip() {
    tooltip.classList.remove("visible");
  }

  document.querySelectorAll(".js-chart").forEach((chart) => {
    const overlay = chart.querySelector(".chart-overlay");
    const guideline = chart.querySelector(".chart-guideline");
    const points = JSON.parse(chart.getAttribute("data-points") || "[]");
    if (!overlay || !points.length) return;

    overlay.addEventListener("mousemove", (event) => {
      const svgRect = chart.getBoundingClientRect();
      const x = event.clientX - svgRect.left;
      let closest = points[0];
      let distance = Math.abs(points[0].x - x);
      for (const point of points) {
        const current = Math.abs(point.x - x);
        if (current < distance) {
          closest = point;
          distance = current;
        }
      }
      if (guideline) {
        guideline.setAttribute("x1", closest.x);
        guideline.setAttribute("x2", closest.x);
        guideline.style.display = "block";
      }
      const html = chart.getAttribute("data-chart-type") === "dual"
        ? `<strong>${closest.label}</strong>
           <div>Выручка: ${formatMoney(closest.revenue)}</div>
           <div>Вал: ${formatMoney(closest.gross)}</div>
           <div>Маржа: ${formatPct(closest.margin)}</div>
           <div>Итог: ${formatMoney(closest.net)}</div>`
        : `<strong>${closest.label}</strong>
           <div>${tooltipMetricLabel()}: ${state.metric === "qty" ? formatNumber(closest.value) : formatMoney(closest.value)}</div>
           <div>Выручка: ${formatMoney(closest.revenue)}</div>
           <div>Вал: ${formatMoney(closest.gross)}</div>
           <div>Итог: ${formatMoney(closest.net)}</div>`;
      showTooltip(event, html);
    });

    overlay.addEventListener("mouseleave", () => {
      if (guideline) guideline.style.display = "none";
      hideTooltip();
    });
  });

  activeTooltipCleanup = () => {
    tooltip.remove();
  };
}

applyPreset(data.days);
render();
