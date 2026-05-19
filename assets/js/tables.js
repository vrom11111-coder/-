
(function () {
  function attachSearch(table) {
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    var search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Поиск по таблице...';
    search.className = 'table-search';
    var status = document.createElement('div');
    status.className = 'table-status';
    var total = table.querySelectorAll('tbody tr').length;
    function updateStatus(visible) {
      status.textContent = 'показано ' + visible + ' из ' + total;
    }
    updateStatus(total);
    search.addEventListener('input', function () {
      var q = this.value.toLowerCase();
      var visible = 0;
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        var show = tr.textContent.toLowerCase().indexOf(q) >= 0;
        tr.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      updateStatus(visible);
    });
    var parent = table.parentNode;
    parent.insertBefore(wrap, table);
    wrap.appendChild(search);
    wrap.appendChild(status);
    wrap.appendChild(table);
  }

  function parseCell(text) {
    var t = text.replace(/[ \s₽%]/g, '').replace(',', '.');
    var num = parseFloat(t);
    if (!isNaN(num) && /^-?[\d.]+$/.test(t)) return num;
    return null;
  }

  function attachSort(table) {
    table.querySelectorAll('thead th').forEach(function (th, idx) {
      th.addEventListener('click', function () {
        var tbody = table.querySelector('tbody');
        var rows = Array.from(tbody.querySelectorAll('tr'));
        var asc = !th.classList.contains('sort-asc');
        table.querySelectorAll('thead th').forEach(function (o) {
          o.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add(asc ? 'sort-asc' : 'sort-desc');
        rows.sort(function (a, b) {
          var x = a.children[idx].textContent.trim();
          var y = b.children[idx].textContent.trim();
          var nx = parseCell(x), ny = parseCell(y);
          if (nx !== null && ny !== null) return asc ? nx - ny : ny - nx;
          return asc ? x.localeCompare(y, 'ru') : y.localeCompare(x, 'ru');
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('table.data-table').forEach(function (t) {
      attachSort(t);
      if (t.classList.contains('searchable')) attachSearch(t);
    });
  });
})();
