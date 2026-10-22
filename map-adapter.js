// 背景の地図を扱う部分（ここだけ差し替えれば Google マップにできる）
//   今: Leaflet ＋ 国土地理院の地図（淡色）
//   Google マップにするとき: 同じ関数（create / addZone / fitAll / panTo / setLabels）を
//   google.maps の Map・Polygon・Marker で作り直した版に置き換える
(function () {
  'use strict';

  const STYLE = {
    normal:   tone => ({ color: tone === 'kita' ? '#0369A1' : '#BE185D', weight: 1.2, opacity: 0.85, fillColor: tone === 'kita' ? '#38BDF8' : '#F472B6', fillOpacity: 0.18 }),
    hover:    () => ({ weight: 2.5, fillOpacity: 0.35 }),
    selected: () => ({ color: '#C2410C', weight: 2.5, opacity: 1, fillColor: '#F97316', fillOpacity: 0.55 })
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

    const zones = [];
    return {
      // 区画を1つ地図に載せる。polys は GeoJSON の MultiPolygon 座標（[経度, 緯度]）
      addZone(z, handlers) {
        const latlngs = z.polys.map(poly => poly.map(ring => ring.map(([lng, lat]) => [lat, lng])));
        let selected = false;
        const layer = L.polygon(latlngs, STYLE.normal(z.tone)).addTo(map);
        layer.on('click', () => handlers.onClick());
        layer.on('mouseover', () => { if (!selected) layer.setStyle(STYLE.hover()); handlers.onHover(true); });
        layer.on('mouseout', () => { layer.setStyle(selected ? STYLE.selected() : STYLE.normal(z.tone)); handlers.onHover(false); });
        const label = L.marker([z.label[1], z.label[0]], {
          interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'zone-label zone-label-' + z.tone, html: z.text, iconSize: null })
        }).addTo(labels);
        // 番号を出し直したときも選択中の色を保つ
        label.on('add', () => { const el = label.getElement(); if (el) el.classList.toggle('on', selected); });
        const h = {
          setSelected(on) {
            selected = on;
            layer.setStyle(on ? STYLE.selected() : STYLE.normal(z.tone));
            label.getElement() && label.getElement().classList.toggle('on', on);
            if (on) layer.bringToFront();
          },
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
      setLabels(on) { labelsOn = on; syncLabels(); },
      resize() { map.invalidateSize(); },
      destroy() { map.remove(); }
    };
  }

  window.HaifuMap = { create };
})();
