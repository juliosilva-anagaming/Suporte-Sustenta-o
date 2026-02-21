window.APP_CONFIG = {
  // Apps Script (Painel Geral)
  SLA_ENDPOINT: "https://script.google.com/macros/s/AKfycbzsFtphjBe__IrZv5gzqMDT8qEmkXi3rHb62W_rzaULSeqsigye2BXUVNGKT91Dc8oi/exec",

  // FastAPI (Mongo -> Sheets) - vazio = mesma origem (quando servir via FastAPI)
  SYNC_API_BASE: "",

  // Atualização automática do Painel Geral
  REFRESH_MS: 600000
};
