// 背景の地図を扱う部分（Leaflet ＋ 国土地理院の地図・淡色）
//   区画・番号・円選択のピンと円を描く。区画の選択や計算は map-app.js
(function () {
  'use strict';

  // 区ごとの色 [線, 塗り]
  const TONE = { nishi: ['#BE185D', '#F472B6'], kita: ['#0369A1', '#38BDF8'], heiwa: ['#15803D', '#4ADE80'] };
  const STYLE = {
    normal:   tone => ({ color: TONE[tone][0], weight: 1.2, opacity: 0.85, fillColor: TONE[tone][1], fillOpacity: 0.18, dashArray: null }),
    hover:    () => ({ weight: 2.5, fillOpacity: 0.35 }),
    selected: () => ({ color: '#C2410C', weight: 2.5, opacity: 1, fillColor: '#F97316', fillOpacity: 0.55, dashArray: null }),
    // 円に入る区画（まだ選んでいないもの）
    preview:  () => ({ color: '#0F766E', weight: 2.5, opacity: 1, fillColor: '#14B8A6', fillOpacity: 0.3, dashArray: '6 4' })
  };

  function create(el) {
    const map = L.map(el, { zoomSnap: 0.25, zoomControl: true, attributionControl: true, tap: true });
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
      maxZoom: 18, minZoom: 10,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>'
    }).addTo(map);
    const labels = L.layerGroup().addTo(map);
    let labelsOn = true;
    // 引いた状態では番号が重なるので、拡大したときだけ番号を出す
    const syncLabels = () => {
      const show = labelsOn && map.getZoom() >= 14;
      if (show && !map.hasLayer(labels)) labels.addTo(map);
      if (!show && map.hasLayer(labels)) labels.remove();
    };
    map.on('zoomend', syncLabels);

    // 円選択のピンと円
    let pin = null, circle = null;
    const pinIcon = L.divIcon({ className: 'circle-pin', html: '<span></span>', iconSize: [28, 38], iconAnchor: [14, 36] });

    const zones = [];
    return {
      // 区画を1つ地図に載せる。polys は GeoJSON の MultiPolygon 座標（[経度, 緯度]）
      addZone(z, handlers) {
        const latlngs = z.polys.map(poly => poly.map(ring => ring.map(([lng, lat]) => [lat, lng])));
        let selected = false, preview = false;
        const base = () => (selected ? STYLE.selected() : preview ? STYLE.preview() : STYLE.normal(z.tone));
        const layer = L.polygon(latlngs, STYLE.normal(z.tone)).addTo(map);
        layer.on('click', () => handlers.onClick());
        layer.on('mouseover', () => { if (!selected) layer.setStyle(STYLE.hover()); handlers.onHover(true); });
        layer.on('mouseout', () => { layer.setStyle(base()); handlers.onHover(false); });
        const label = L.marker([z.label[1], z.label[0]], {
          interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'zone-label zone-label-' + z.tone, html: z.text, iconSize: null })
        }).addTo(labels);
        // 番号を出し直したときも選択中の色を保つ
        label.on('add', () => { const e = label.getElement(); if (e) e.classList.toggle('on', selected); });
        const h = {
          setSelected(on) {
            selected = on;
            layer.setStyle(base());
            label.getElement() && label.getElement().classList.toggle('on', on);
            if (on) layer.bringToFront();
          },
          setPreview(on) { if (preview === on) return; preview = on; layer.setStyle(base()); if (on && !selected) layer.bringToFront(); },
          bounds: () => layer.getBounds()
        };
        zones.push(h);
        return h;
      },
      fitAll() {
        const b = zones.reduce((acc, z) => (acc ? acc.extend(z.bounds()) : L.latLngBounds(z.bounds().getSouthWest(), z.bounds().getNorthEast())), null);
        if (b) map.fitBounds(b, { padding: [10, 10] });
        syncLabels();
      },
      panTo(lat, lng, zoom) { map.setView([lat, lng], zoom || 16); },
      center() { const c = map.getCenter(); return [c.lat, c.lng]; },
      // 円を出す（無ければ作る）。onMove はピンを動かしたときに [緯度, 経度] で呼ばれる
      showCircle(lat, lng, radiusM, onMove) {
        if (!pin) {
          pin = L.marker([lat, lng], { draggable: true, icon: pinIcon, zIndexOffset: 1000, title: 'ドラッグして動かせます' }).addTo(map);
          circle = L.circle([lat, lng], { radius: radiusM, color: '#0F766E', weight: 2, fillColor: '#14B8A6', fillOpacity: 0.08, interactive: false }).addTo(map);
          pin.on('drag', () => { const p = pin.getLatLng(); circle.setLatLng(p); onMove([p.lat, p.lng]); });
          pin.on('dragend', () => { const p = pin.getLatLng(); onMove([p.lat, p.lng]); });
        } else { pin.setLatLng([lat, lng]); circle.setLatLng([lat, lng]); circle.setRadius(radiusM); }
        // 円が画面からはみ出すときは、円全体が見えるように引く
        if (!map.getBounds().contains(circle.getBounds())) map.fitBounds(circle.getBounds(), { padding: [20, 20] });
      },
      setRadius(radiusM) { if (circle) { circle.setRadius(radiusM); if (!map.getBounds().contains(circle.getBounds())) map.fitBounds(circle.getBounds(), { padding: [20, 20] }); } },
      hideCircle() { if (pin) { pin.remove(); circle.remove(); pin = circle = null; } },
      setLabels(on) { labelsOn = on; syncLabels(); },
      resize() { map.invalidateSize(); },
      destroy() { map.remove(); }
    };
  }

  window.HaifuMap = { create };
})();
