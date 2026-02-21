window.APP_CONFIG = {
  // Apps Script (Painel Geral)
  SLA_ENDPOINT: "https://script.google.com/macros/s/AKfycbxE4gr69DwPvrvW6T5JOyi6EruWnniFVTCiqPYvMQfC4r-CnnuCfJez7u4XE5UufWJD/exec",

  // FastAPI (Mongo -> Sheets) - vazio = mesma origem (quando servir via FastAPI)
  SYNC_API_BASE: "",

  // Atualização automática do Painel Geral
  REFRESH_MS: 600000
};
