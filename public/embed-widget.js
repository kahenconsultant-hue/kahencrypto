(function () {
  const currentScript = document.currentScript;
  const apiBase = currentScript && currentScript.dataset.apiBase ? currentScript.dataset.apiBase : window.location.origin;
  const targetId = currentScript && currentScript.dataset.target ? currentScript.dataset.target : "crypto-macro-widget";
  const target = document.getElementById(targetId);

  if (!target) return;

  target.innerHTML = '<div style="font-family:Tahoma,Arial,sans-serif;background:#080d16;color:#e6edf5;border:1px solid #263244;border-radius:8px;padding:12px">در حال دریافت هوش کلان کریپتو...</div>';

  fetch(apiBase + "/api/v1/wordpress")
    .then(function (response) {
      return response.json();
    })
    .then(function (payload) {
      const regime = payload.widgets.regime;
      const alerts = payload.widgets.alerts || [];
      target.innerHTML =
        '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#080d16;color:#e6edf5;border:1px solid #263244;border-radius:8px;padding:14px;line-height:1.8">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong>Crypto Macro Intelligence</strong><span style="color:#fbbf24">' +
        regime.active +
        "</span></div>" +
        '<p style="font-size:12px;color:#a8b3c4">' +
        regime.interpretationFa +
        "</p>" +
        alerts
          .map(function (alert) {
            return '<div style="border-top:1px solid #263244;padding-top:8px;margin-top:8px;font-size:12px"><b>' + alert.level + "</b> · " + alert.titleFa + "</div>";
          })
          .join("") +
        '<div style="border-top:1px solid #263244;margin-top:10px;padding-top:8px;font-size:11px;color:#fcd34d">این widget سیگنال معامله یا مشاوره سرمایه‌گذاری نیست.</div>' +
        "</div>";
    })
    .catch(function () {
      target.innerHTML = '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#080d16;color:#fecaca;border:1px solid #7f1d1d;border-radius:8px;padding:12px">خطا در دریافت widget.</div>';
    });
})();
