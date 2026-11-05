// Atmósfera y tema antes de pintar (sin destello del color equivocado).
// Va en un archivo aparte porque la app de la Mac no permite código dentro del HTML.
try {
  var p = JSON.parse(localStorage.getItem('la-joya-mac:apariencia') || '{}')
  if (p.atmos) document.documentElement.setAttribute('data-atmos', p.atmos)
  if (p.tema === 'light' || p.tema === 'dark') document.documentElement.setAttribute('data-theme', p.tema)
} catch (e) {}
