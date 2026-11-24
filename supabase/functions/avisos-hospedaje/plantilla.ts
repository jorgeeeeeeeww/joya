// Plantilla común para los avisos por correo. El contenido y los destinatarios se generan en la base.
function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function contenido(texto: string): string {
  // Enlazar solo direcciones HTTPS; escapar también el texto de huéspedes y las URL.
  return texto.split(/(https:\/\/[^\s<>"']+)/g).map((parte, i) => {
    if (i % 2 === 0) return escapar(parte).replace(/\r?\n/g, '<br>')
    const url = escapar(parte)
    const etiqueta = /\/mi-reservacion(?:[/?#]|$)/.test(parte) ? 'Abrir mi reservación' : url
    return `<a class="enlace" href="${url}" style="color:#285637;font-weight:700;text-decoration:underline;overflow-wrap:anywhere">${etiqueta}</a>`
  }).join('')
}

export function correoHtml(asunto: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapar(asunto)}</title>
<style>
@media only screen and (max-width:600px) {
  .exterior { padding:16px 12px !important; }
  .marca { padding:22px 20px 18px !important; }
  .contenido { padding:26px 22px 30px !important; }
  .titulo { font-size:23px !important; line-height:1.3 !important; }
  .texto { font-size:16px !important; line-height:1.65 !important; }
}
@media (prefers-color-scheme:dark) {
  .fondo { background-color:#171d19 !important; }
  .tarjeta, .contenido, .pie { background-color:#253029 !important; }
  .tarjeta { border-color:#69776b !important; }
  .titulo, .texto { color:#fffdf8 !important; }
  .pie { color:#e5e9df !important; border-color:#69776b !important; }
  .enlace, .enlace-pie { color:#c8e9b8 !important; }
  .marca { background-color:#f6f2eb !important; }
}
</style></head>
<body class="fondo" style="margin:0;padding:0;background-color:#eee8de;color:#1b1612;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<table role="presentation" class="fondo" width="100%" cellspacing="0" cellpadding="0" bgcolor="#eee8de" style="background-color:#eee8de"><tr><td class="exterior" align="center" style="padding:32px 14px">
<table role="presentation" class="tarjeta" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f6f2eb" style="max-width:580px;background-color:#f6f2eb;border:1px solid #d3c8b9">
<tr><td class="marca" align="center" bgcolor="#f6f2eb" style="padding:28px 24px 22px;background-color:#f6f2eb;border-bottom:1px solid #d3c8b9">
<img src="https://jardineslajoya.com/logo-jardines-la-joya.png" alt="Jardines La Joya" width="104" style="display:block;width:104px;height:auto;border:0">
<p style="margin:12px 0 0;color:#566650;font-size:12px;letter-spacing:2px;text-transform:uppercase">Jardines La Joya</p>
</td></tr>
<tr><td class="contenido" style="padding:30px 32px 34px;background-color:#f6f2eb">
<h1 class="titulo" style="margin:0 0 22px;color:#1b1612;font-family:Georgia,serif;font-size:25px;line-height:1.3;font-weight:normal">${escapar(asunto)}</h1>
<div class="texto" style="color:#241d18;font-size:16px;line-height:1.7;overflow-wrap:anywhere">${contenido(cuerpo)}</div>
</td></tr>
<tr><td class="pie" align="center" style="padding:20px 24px;background-color:#f6f2eb;border-top:1px solid #d3c8b9;color:#51483e;font-size:13px;line-height:1.6">
Jardines La Joya · Tototlán, Jalisco<br><a class="enlace-pie" href="https://jardineslajoya.com" style="color:#285637;text-decoration:underline">jardineslajoya.com</a>
</td></tr></table>
</td></tr></table></body></html>`
}
