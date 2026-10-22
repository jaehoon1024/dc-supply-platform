// UTM-K(EPSG:5179, GRS80) ↔ WGS84 위경도 변환 — 도로명주소 좌표제공 API(entX, entY)를 지도 좌표로 바꿀 때 사용
// 횡메르카토르(TM) 표준식(Snyder). GRS80과 WGS84 차이는 지도 표시에 무시할 수준(수 mm).
const A = 6378137, F = 1 / 298.257222101, K0 = 0.9996, LAT0 = 38 * Math.PI / 180, LON0 = 127.5 * Math.PI / 180, FE = 1000000, FN = 2000000;
const E2 = F * (2 - F), EP2 = E2 / (1 - E2);
const M = phi => A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * phi - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * phi)
  + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * E2 ** 3 / 3072) * Math.sin(6 * phi));
const M0 = M(LAT0);

export function toUtmk(lat, lng) {
  const phi = lat * Math.PI / 180, lam = lng * Math.PI / 180;
  const N = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = EP2 * Math.cos(phi) ** 2, Aa = (lam - LON0) * Math.cos(phi);
  const x = FE + K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * EP2) * Aa ** 5 / 120);
  const y = FN + K0 * (M(phi) - M0 + N * Math.tan(phi) * (Aa ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * Aa ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * EP2) * Aa ** 6 / 720));
  return { x, y };
}

export function fromUtmk(x, y) {
  const m = M0 + (Number(y) - FN) / K0;
  const mu = m / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const N1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) ** 2), T1 = Math.tan(phi1) ** 2, C1 = EP2 * Math.cos(phi1) ** 2;
  const R1 = A * (1 - E2) / (1 - E2 * Math.sin(phi1) ** 2) ** 1.5, D = (Number(x) - FE) / (N1 * K0);
  const phi = phi1 - (N1 * Math.tan(phi1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * EP2 - 3 * C1 ** 2) * D ** 6 / 720);
  const lam = LON0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * EP2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(phi1);
  return { lat: Math.round(phi * 180 / Math.PI * 1e6) / 1e6, lng: Math.round(lam * 180 / Math.PI * 1e6) / 1e6 };
}
