/* =============================================================
   Content OS — application logic (modular, no inline handlers)
   Data source: window.OS_DATA (dashboard.data.js)
   Modules: Util · Nav · Health · Strips · Queue · Briefs ·
            Forecast · Charts · Blocks · Table · App(init)
   All rendering is data-driven; the HTML ships empty containers.
   ============================================================= */
(function () {
  'use strict';

  var D = window.OS_DATA;
  if (!D) { console.error('OS_DATA missing'); return; }

  /* ---------- Util: tiny helpers ---------- */
  var Util = {
    // compact number formatting: 1.8M / 34.1K / 812
    fmt: function (n) {
      n = +n || 0;
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
      return String(Math.round(n));
    },
    id: function (x) { return document.getElementById(x); },
    // debounce: coalesce rapid events (used for search input)
    debounce: function (fn, ms) {
      var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
    },
    // health/quality colour ramp
    ramp: function (v, hi, mid) { return v >= hi ? 'var(--green)' : v >= mid ? 'var(--amber)' : 'var(--red)'; }
  };

  /* ---------- Nav: sidebar links + scroll-spy ---------- */
  var Nav = {
    items: [['s0', 'Health', '🩺'], ['s1', 'Decisions', '✅'], ['s2', 'Briefs', '🎬'],
            ['s3', 'Forecast', '📈'], ['s4', 'Trend & Why', '📉'], ['s6', 'Pillars', '🏛️'],
            ['s8', 'DNA & Gaps', '🧬'], ['s10', 'All Content', '🗂️']],
    // sub-sections map back to the nav entry that owns them
    alias: { s5: 's4', s7: 's6', s9: 's8' },
    render: function () {
      Util.id('nav').innerHTML = this.items.map(function (it) {
        return '<a href="#' + it[0] + '" data-t="' + it[0] + '">' +
          '<span class="ic" aria-hidden="true">' + it[2] + '</span><span class="lb">' + it[1] + '</span></a>';
      }).join('');
    },
    spy: function () {
      var links = {};
      document.querySelectorAll('.snav a').forEach(function (a) { links[a.dataset.t] = a; });
      var self = this;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var target = self.alias[e.target.id] || e.target.id;
          Object.keys(links).forEach(function (k) { links[k].setAttribute('aria-current', k === target ? 'true' : 'false'); });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      ['s0', 's1', 's2', 's3', 's4', 's6', 's8', 's10'].forEach(function (i) {
        var el = Util.id(i); if (el) io.observe(el);
      });
    }
  };

  /* ---------- Health: gauge + diagnosis + components ---------- */
  var Health = {
    render: function () {
      var H = D.health, col = H.score >= 65 ? 'var(--green)' : H.score >= 50 ? 'var(--amber)' : H.score >= 35 ? '#f5955a' : 'var(--red)';
      var sc = Util.id('hsc'); sc.textContent = H.score; sc.style.color = col;
      Util.id('ring').style.background = 'conic-gradient(' + col + ' ' + (H.score * 3.6) + 'deg, #232a36 0deg)';
      Util.id('ring').setAttribute('aria-label', 'คะแนนสุขภาพคอนเทนต์ ' + H.score + ' จาก 100 เกรด ' + H.grade);
      Util.id('hgr').innerHTML = 'เกรด <span style="color:' + col + '">' + H.grade + '</span>';
      Util.id('hproj').innerHTML = 'ถ้าทำตามผังแนะนำ → <b>' + H.proj + '/100 (' + H.proj_grade + ')</b>';
      Util.id('dg-what').textContent = D.diagnosis.what;
      Util.id('dg-why').textContent = D.diagnosis.why;
      Util.id('dg-next').textContent = D.diagnosis.next;
      Util.id('hcomp').innerHTML = H.components.map(function (c) {
        var cc = Util.ramp(c.v, 60, 35);
        return '<div class="c"><div class="k">' + c.k + '</div><div class="v" style="color:' + cc + '">' + c.v +
          '</div><div class="hbar"><i style="width:' + c.v + '%;background:' + cc + '"></i></div></div>';
      }).join('');
    }
  };

  /* ---------- Strips: every section ends with a recommendation ---------- */
  var Strips = {
    render: function () {
      var map = {}; (D.section_decisions || []).forEach(function (x) { map[x.sec] = x; });
      function html(x) {
        return '<div class="decstrip"><div class="hd">🧭 คำแนะนำ · อ่านค่า → ทำไม → ทำอะไร → ผลที่คาด</div>' +
          '<div class="decsteps">' +
          '<div class="dstep dstep--read"><div class="l">📊 อ่านค่า</div><div class="t">' + x.read + '</div></div>' +
          '<div class="dstep dstep--why"><div class="l">🧠 ทำไม</div><div class="t">' + x.why + '</div></div>' +
          '<div class="dstep dstep--act"><div class="l">✅ ทำอะไร</div><div class="t">' + x.action + '</div></div>' +
          '<div class="dstep dstep--imp"><div class="l">📈 ผลที่คาด</div><div class="t">' + x.impact + '</div></div>' +
          '</div></div>';
      }
      document.querySelectorAll('.decwrap').forEach(function (w) {
        var ids = w.dataset.secs.split(',').filter(function (i) { return map[i]; });
        if (ids.length > 1) w.classList.add('is-two');
        w.innerHTML = ids.map(function (i) { return html(map[i]); }).join('');
      });
    }
  };

  /* ---------- Queue: decision cards with 3-state status (localStorage) ---------- */
  var Queue = {
    STATES: ['todo', 'doing', 'done'],
    LABEL: { todo: '▢ ยังไม่เริ่ม', doing: '◐ กำลังทำ', done: '✓ เสร็จ' },
    get: function (id) { try { return localStorage.getItem('os_' + id) || 'todo'; } catch (e) { return 'todo'; } },
    set: function (id, v) { try { localStorage.setItem('os_' + id, v); } catch (e) {} },
    render: function () {
      var self = this;
      Util.id('dq').innerHTML = D.decisions.map(function (x) {
        var s = self.get(x.id), imp = x.impact === 'สูง' ? 'chip--hi' : 'chip--md';
        return '<div class="dcard ' + (s === 'done' ? 'is-done' : '') + '" data-card="' + x.id + '">' +
          '<button type="button" class="stbtn ' + (s === 'doing' ? 'is-doing' : s === 'done' ? 'is-done' : '') +
            '" data-id="' + x.id + '" aria-label="สถานะ: ' + self.LABEL[s].slice(2) + ' — กดเพื่อเปลี่ยน">' + self.LABEL[s] + '</button>' +
          '<div class="dbody"><div class="dt">' + x.title + '</div><div class="dw">' + x.why + '</div>' +
          '<div class="dmeta"><span class="chip ' + imp + '">Impact ' + x.impact + '</span>' +
          '<span class="chip chip--eff">Effort ' + x.effort + '</span>' +
          (x.brief ? '<button type="button" class="blink" data-brief="' + x.brief + '">→ ดูบรีฟ</button>' : '') +
          '</div></div></div>';
      }).join('');
    },
    // event delegation: one listener handles all status/brief clicks
    bind: function () {
      var self = this;
      Util.id('dq').addEventListener('click', function (e) {
        var st = e.target.closest('.stbtn');
        if (st) { var id = st.dataset.id, cur = self.get(id); self.set(id, self.STATES[(self.STATES.indexOf(cur) + 1) % 3]); self.render(); return; }
        var br = e.target.closest('.blink');
        if (br) { var d = Util.id('br_' + br.dataset.brief); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } }
      });
    }
  };

  /* ---------- Briefs: accessible <details> disclosure cards ---------- */
  var Briefs = {
    render: function () {
      Util.id('briefs').innerHTML = D.briefs.map(function (b) {
        return '<details class="card brief" id="br_' + b.id + '">' +
          '<summary><span class="em" aria-hidden="true">' + b.emoji + '</span><span class="bt">' + b.title + '</span>' +
          '<span class="chev" aria-hidden="true">▸</span><span class="pv">' + b.pred + '</span></summary>' +
          '<div class="det"><div class="hk">Hook (2 วิแรก): ' + b.hook + '</div>' +
          '<ol>' + b.beats.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>' +
          '<div class="cta">CTA: <b>' + b.cta + '</b></div>' +
          '<div class="bs">อิงข้อมูล: ' + b.basis + ' · เสา: ' + b.tag + '</div></div></details>';
      }).join('');
    }
  };

  /* ---------- Forecast: what-if mix simulator ---------- */
  var Forecast = {
    FP: D.forecast.pillars, base: D.forecast.baseline_recent, mix: null,
    render: function () {
      this.mix = this.FP.map(function (p) { return p.recent; });
      this.drawSliders();
      this.recalc();
    },
    drawSliders: function () {
      var self = this;
      Util.id('sliders').innerHTML = this.FP.map(function (p, i) {
        return '<div class="slrow"><label for="sl_' + i + '">' + p.name + '</label>' +
          '<input id="sl_' + i + '" type="range" min="0" max="60" value="' + self.mix[i] + '" data-i="' + i +
          '" aria-label="สัดส่วน ' + p.name + '"><span class="pc" id="pc_' + i + '">' + self.mix[i] + '%</span></div>';
      }).join('');
    },
    // recompute weighted projection; batch reads then writes to avoid layout thrash
    recalc: function () {
      var sum = this.mix.reduce(function (a, b) { return a + b; }, 0) || 1;
      var v = 0, e = 0, q = 0, self = this;
      this.FP.forEach(function (p, i) { var w = self.mix[i] / sum; v += w * p.v; e += w * p.er; q += w * p.q; });
      // writes
      this.FP.forEach(function (p, i) {
        var pct = Math.round(self.mix[i] / sum * 100);
        var el = Util.id('pc_' + i); if (el) el.textContent = pct + '%';
        var sl = Util.id('sl_' + i); if (sl) sl.setAttribute('aria-valuetext', pct + '%');
      });
      Util.id('fv').textContent = Util.fmt(v);
      var dl = Math.round((v - this.base) / this.base * 100);
      Util.id('fvd').innerHTML = '<span class="' + (dl >= 0 ? 'up' : 'down') + '">' + (dl >= 0 ? '+' : '') + dl +
        '%</span> เทียบเดือนนี้ (' + Util.fmt(this.base) + ')';
      Util.id('fe').textContent = e.toFixed(2) + '%';
      Util.id('fq').textContent = q.toFixed(2) + '/5';
    },
    setMix: function (key) { this.mix = this.FP.map(function (p) { return p[key]; }); this.drawSliders(); this.recalc(); },
    bind: function () {
      var self = this;
      Util.id('sliders').addEventListener('input', function (e) {
        var i = e.target.dataset.i; if (i == null) return; self.mix[+i] = +e.target.value; self.recalc();
      });
      document.querySelectorAll('.fcbtns .btn').forEach(function (b) {
        b.addEventListener('click', function () { self.setMix(b.dataset.mix); });
      });
    }
  };

  /* ---------- Charts: trend (bar+line) and matrix (bubble) ---------- */
  var Charts = {
    axis: { grid: { color: '#232a36' }, ticks: { color: '#9aa4b2', font: { size: 11 } } },
    trend: function () {
      new Chart(Util.id('trend'), {
        data: {
          labels: D.trend.map(function (t) { return t.month.slice(2); }),
          datasets: [
            { type: 'bar', label: 'วิวเฉลี่ย', data: D.trend.map(function (t) { return t.avg_views; }), backgroundColor: '#5b9dff44', borderColor: '#5b9dff', borderWidth: 1, yAxisID: 'y', order: 2 },
            { type: 'line', label: 'คุณภาพ', data: D.trend.map(function (t) { return t.q; }), borderColor: '#f5b95a', tension: .3, yAxisID: 'y2', pointRadius: 2, order: 1 },
            { type: 'line', label: 'ER%', data: D.trend.map(function (t) { return t.er; }), borderColor: '#33d19f', borderDash: [4, 3], tension: .3, yAxisID: 'y2', pointRadius: 2, order: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#9aa4b2', boxWidth: 11, font: { size: 11 } } } },
          scales: {
            y: { grid: { color: '#232a36' }, ticks: { color: '#9aa4b2', font: { size: 11 }, callback: function (v) { return Util.fmt(v); } } },
            y2: { position: 'right', min: 0, max: 5, grid: { drawOnChartArea: false }, ticks: { color: '#9aa4b2', font: { size: 11 } } },
            x: this.axis
          }
        }
      });
    },
    matrix: function () {
      var cols = D.matrix.map(function (m) { return m.quick_win ? '#33d19f' : m.effort > 3 ? '#ff6b78' : '#5b9dff'; });
      new Chart(Util.id('matrix'), {
        type: 'bubble',
        data: { datasets: D.matrix.map(function (m, i) { return { label: m.pillar, data: [{ x: m.effort, y: m.impact, r: 8 + m.n * 1.3 }], backgroundColor: cols[i] + 'cc', borderColor: cols[i] }; }) },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { var m = D.matrix[c.datasetIndex]; return m.pillar + ': ' + Util.fmt(m.avg_views) + ' วิว, ' + m.n + ' คลิป'; } } } },
          scales: {
            x: { grid: { color: '#232a36' }, ticks: { color: '#9aa4b2', font: { size: 11 } }, min: .5, max: 5.5, title: { display: true, text: 'Effort →', color: '#9aa4b2', font: { size: 11 } } },
            y: { grid: { color: '#232a36' }, ticks: { color: '#9aa4b2', font: { size: 11 } }, min: 0, max: 105, title: { display: true, text: 'Impact →', color: '#9aa4b2', font: { size: 11 } } }
          }
        },
        // quadrant guide lines + label drawn once
        plugins: [{ id: 'quad', beforeDraw: function (c) {
          var ctx = c.ctx, a = c.chartArea, s = c.scales, xm = s.x.getPixelForValue(3), ym = s.y.getPixelForValue(50);
          ctx.save(); ctx.strokeStyle = '#303947'; ctx.setLineDash([4, 4]); ctx.beginPath();
          ctx.moveTo(xm, a.top); ctx.lineTo(xm, a.bottom); ctx.moveTo(a.left, ym); ctx.lineTo(a.right, ym); ctx.stroke();
          ctx.setLineDash([]); ctx.fillStyle = 'rgba(51,209,159,.5)'; ctx.font = '11px Inter'; ctx.fillText('QUICK WINS', a.left + 8, a.top + 15); ctx.restore();
        } }]
      });
    }
  };

  /* ---------- Blocks: pillar bars, DNA gap, bottom list, bar animation ---------- */
  var Blocks = {
    pillars: function () {
      var maxv = Math.max.apply(null, D.pillars.map(function (p) { return p.avg_views; }));
      Util.id('pillars').innerHTML = D.pillars.map(function (p) {
        return '<div class="pbar"><div class="pn">' + p.pillar +
          (p.quick_win ? ' <span class="tag" style="color:var(--green);border-color:var(--green)">Quick Win</span>' : '') + '</div>' +
          '<div class="track"><div class="tf" data-w="' + Math.round(p.avg_views / maxv * 100) + '"></div><span class="vlab">' + Util.fmt(p.avg_views) + '</span></div>' +
          '<div class="pstats"><span>ER <b>' + p.er + '%</b></span><span>คุณภาพ <b>' + p.q + '</b></span><span><b>' + p.n + '</b> คลิป</span></div></div>';
      }).join('');
    },
    dna: function () {
      Util.id('dnagap').innerHTML = D.dna_gap.map(function (g) {
        var col = g.gap > 8 ? 'var(--red)' : g.gap < -8 ? 'var(--amber)' : 'var(--sub)';
        var tag = g.gap > 8 ? 'ลงเยอะไป' : g.gap < -8 ? 'ยังขาด' : 'พอดี';
        return '<div class="gaprow"><div class="lab">' + g.name + '<small>' + g.th + '</small></div>' +
          '<div class="gbar"><div class="cur" data-w="' + g.current + '"></div><div class="idl" style="left:' + g.ideal + '%"></div></div>' +
          '<div class="gv">' + g.current + '% → <b>' + g.ideal + '%</b><br><span style="color:' + col + ';font-size:11px">' + tag + '</span></div></div>';
      }).join('');
    },
    bottom: function () {
      Util.id('botList').innerHTML = D.bottom.map(function (r, i) {
        return '<div class="rank"><span class="no">' + (i + 1) + '</span>' +
          '<a class="cap" href="' + r.url + '" target="_blank" rel="noopener">' + r.caption + '</a>' +
          '<span class="val">' + Util.fmt(r.views) + '</span><span class="why">' + r.reason + '</span></div>';
      }).join('');
    },
    // trigger width transitions after first paint (skipped visually under reduced-motion)
    animateBars: function () {
      requestAnimationFrame(function () {
        setTimeout(function () {
          document.querySelectorAll('.tf,.cur').forEach(function (e) { if (e.dataset.w != null) e.style.width = e.dataset.w + '%'; });
        }, 120);
      });
    }
  };

  /* ---------- Table: search (debounced) + filter + sort (a11y) ---------- */
  var Table = {
    key: 'views', dir: -1,
    qcls: function (q) { return q >= 3.5 ? 'q-hi' : q >= 2.6 ? 'q-mid' : 'q-lo'; },
    render: function () {
      var self = this, term = Util.id('q').value.trim().toLowerCase(), fp = Util.id('fpillar').value;
      var rows = D.rows.filter(function (r) {
        return (!term || r.caption.toLowerCase().indexOf(term) !== -1) && (fp === 'all' || r.pillar === fp);
      });
      rows.sort(function (a, b) {
        var x = a[self.key], y = b[self.key];
        if (self.key === 'caption' || self.key === 'pillar' || self.key === 'date') return self.dir * String(x).localeCompare(String(y), 'th');
        return self.dir * ((x || 0) - (y || 0));
      });
      var html = rows.map(function (r) {
        var vs = r.pinned ? '<span class="pin">ปักหมุด</span>' :
          (r.vs_avg.charAt(0) === '+' ? '<span class="up7">' + r.vs_avg + '</span>' : '<span class="down7">' + r.vs_avg + '</span>');
        return '<tr><td class="num dim">' + r.date.slice(5) + '</td>' +
          '<td><a class="cap" href="' + r.url + '" target="_blank" rel="noopener">' + r.caption + '</a></td>' +
          '<td><span class="tag">' + r.pillar + '</span></td>' +
          '<td class="num">' + Util.fmt(r.views) + '</td><td class="num">' + r.er + '%</td>' +
          '<td class="num">' + r.hook + '</td><td class="num">' + r.key_msg + '</td><td class="num">' + r.authenticity + '</td><td class="num">' + r.cta + '</td>' +
          '<td class="num"><span class="qpill ' + self.qcls(r.quality) + '">' + r.quality + '</span></td><td class="num">' + vs + '</td></tr>';
      }).join('');
      document.querySelector('#tbl tbody').innerHTML = html;
      Util.id('tcount').textContent = rows.length + ' คลิป';
    },
    // reflect current sort in aria-sort for screen readers
    syncAria: function () {
      var self = this;
      document.querySelectorAll('#tbl th').forEach(function (th) {
        th.setAttribute('aria-sort', th.dataset.k === self.key ? (self.dir === 1 ? 'ascending' : 'descending') : 'none');
      });
    },
    sortBy: function (k) {
      if (this.key === k) this.dir *= -1;
      else { this.key = k; this.dir = (k === 'caption' || k === 'pillar' || k === 'date') ? 1 : -1; }
      this.syncAria(); this.render();
    },
    init: function () {
      var self = this, fp = Util.id('fpillar');
      // populate pillar filter once
      var seen = {}; D.rows.forEach(function (r) { seen[r.pillar] = 1; });
      Object.keys(seen).sort().forEach(function (p) { var o = document.createElement('option'); o.value = o.textContent = p; fp.appendChild(o); });
      // search is debounced for performance on keystrokes
      Util.id('q').addEventListener('input', Util.debounce(function () { self.render(); }, 150));
      fp.addEventListener('change', function () { self.render(); });
      Util.id('fsort').addEventListener('change', function (e) { self.key = e.target.value; self.dir = -1; self.syncAria(); self.render(); });
      // header click + keyboard (Enter/Space) sorting
      document.querySelectorAll('#tbl th').forEach(function (th) {
        th.addEventListener('click', function () { self.sortBy(th.dataset.k); });
        th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.sortBy(th.dataset.k); } });
      });
      this.render();
    }
  };

  /* ---------- App: bootstrap ---------- */
  function init() {
    Util.id('upd').textContent = 'อัปเดต ' + D.meta.updated + ' · ' + D.meta.n + ' คลิป';
    Nav.render(); Nav.spy();
    Strips.render();
    Health.render();
    Queue.render(); Queue.bind();
    Briefs.render();
    Forecast.render(); Forecast.bind();
    Charts.trend(); Charts.matrix();
    Blocks.pillars(); Blocks.dna(); Blocks.bottom(); Blocks.animateBars();
    Table.init();
  }

  // `defer` guarantees DOM is parsed; run immediately (guard just in case).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
