/* Manual city reference coordinates. No device GPS and no automatic external geocoder. */
window.SolarApp = window.SolarApp || {};
SolarApp.CityReference = (function () {
  const CITIES = {
    musiri: [10.952, 78.422],
    trichy: [10.7905, 78.7047],
    tiruchirappalli: [10.7905, 78.7047],
    chennai: [13.0827, 80.2707],
    coimbatore: [11.0168, 76.9558],
    madurai: [9.9252, 78.1198],
    salem: [11.6643, 78.1460],
    thanjavur: [10.7867, 79.1378],
    tanjore: [10.7867, 79.1378],
    karur: [10.9601, 78.0766],
    namakkal: [11.2194, 78.1677],
    erode: [11.3410, 77.7172],
    tiruppur: [11.1085, 77.3411],
    dindigul: [10.3673, 77.9803],
    vellore: [12.9165, 79.1325],
    tirunelveli: [8.7139, 77.7567],
    thoothukudi: [8.7642, 78.1348],
    tuticorin: [8.7642, 78.1348],
    sivakasi: [9.4497, 77.7974],
    virudhunagar: [9.5851, 77.9579],
    pudukkottai: [10.3797, 78.8208],
    nagapattinam: [10.7672, 79.8449],
    mayiladuthurai: [11.1018, 79.6520],
    kumbakonam: [10.9602, 79.3845],
    cuddalore: [11.7480, 79.7714],
    villupuram: [11.9401, 79.4861],
    dharmapuri: [12.1211, 78.1582],
    krishnagiri: [12.5186, 78.2137],
    hosur: [12.7409, 77.8253],
    ooty: [11.4102, 76.6950],
    udhagamandalam: [11.4102, 76.6950],
    pollachi: [10.6627, 77.0067],
    palani: [10.4503, 77.5209]
  };
  function key(s){ return String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,''); }
  function find(city){ return CITIES[key(city)] || null; }
  return { find, list: CITIES };
})();
