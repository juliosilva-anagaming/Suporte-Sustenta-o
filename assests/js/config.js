window.APP_CONFIG = {
  // Apps Script (Painel Geral)
  SLA_ENDPOINT: "https://script.google.com/macros/s/AKfycbwT4HZPjvzC0ReOd6wpC0xhqoAnUbLU2ntj3ir5SVQ7MUFuvsERrq_sIUAbONFhwbLR/exec",

  // FastAPI (Mongo -> Sheets) - vazio = mesma origem (quando servir via FastAPI)
  SYNC_API_BASE: "",

  // Atualização automática do Painel Geral
  REFRESH_MS: 600000
};
