// JSONP para evitar CORS quando consumindo Apps Script
function fetchPainelDadosJsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
    const script = document.createElement("script");

    window[cb] = (data) => {
      resolve(data);
      delete window[cb];
      script.remove();
    };

    script.onerror = () => {
      delete window[cb];
      script.remove();
      reject(new Error("Falha ao carregar dados do endpoint (JSONP)."));
    };

    script.src = `${url}?callback=${cb}`;
    document.body.appendChild(script);
  });
}
