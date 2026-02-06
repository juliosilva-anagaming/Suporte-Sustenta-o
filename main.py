from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from datetime import datetime, timezone, date
from pymongo import MongoClient
import gspread
import os
from dotenv import load_dotenv
import logging
import time

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ANA-SUSTENTACAO")

# =========================================================
# CONFIGURAÇÕES
# =========================================================
MONGO_URI = os.getenv("MONGO_URI", "")
PLANILHA_ID = os.getenv("PLANILHA_ID", "1PNykaHfV4V7D94zUS_qj47KHHb4hLxBuZTCmTDrb87E")
ABA_DESTINO = os.getenv("ABA_DESTINO", "ATIVACOES")
GOOGLE_CREDENTIALS_FILE = os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials.json")

# LIMITE MÍNIMO DE DATA (IMPORTANTE)
DATA_INICIO_LIMITE = date(2025, 11, 13)  # 13/11/2025

# Estado para monitoramento do botão de sincronização
last_sync = {"status": "idle", "message": "Aguardando...", "linhas": 0, "error": None}

app = FastAPI(title="ANA GAMING - Sustentação")

# =========================================================
# SERVIR FRONTEND
# =========================================================
if os.path.exists("assests"):
    app.mount("/assests", StaticFiles(directory="assests"), name="assests")

@app.get("/", include_in_schema=False)
def root():
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    return {"status": "ok", "message": "API no ar (index.html não encontrado)"}

# =========================================================
# CORS
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # se quiser travar, troque para o domínio do seu front
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# GOOGLE SHEETS (carrega 1 vez)
# =========================================================
try:
    gc = gspread.service_account(filename=GOOGLE_CREDENTIALS_FILE)
    planilha = gc.open_by_key(PLANILHA_ID)
    aba_destinataria = planilha.worksheet(ABA_DESTINO)
    logger.info("Google Sheets conectado com sucesso.")
except Exception as e:
    logger.error(f"Erro ao conectar no Google Sheets: {e}")
    aba_destinataria = None

# =========================================================
# HELPERS
# =========================================================
def parse_data_yyyy_mm_dd(data_str: str) -> date:
    """
    Espera YYYY-MM-DD
    """
    try:
        return datetime.strptime(data_str, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail=f"Data inválida: {data_str}. Use YYYY-MM-DD")

def aplicar_limite_inicio(inicio: date) -> date:
    """
    Força início mínimo em 13/11/2025
    """
    if inicio < DATA_INICIO_LIMITE:
        return DATA_INICIO_LIMITE
    return inicio

def get_collection():
    if not MONGO_URI:
        raise HTTPException(status_code=500, detail="MONGO_URI não definido no .env")

    client = MongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=15000,  # 15s (não deixa travar infinito)
        connectTimeoutMS=15000,
        socketTimeoutMS=300000,          # 5 min para query grande
    )

    # força validar conexão agora
    client.admin.command("ping")

    db = client["campanhas"]
    return db["userDailyPlays"]

# =========================================================
# MODELS
# =========================================================
class ResumoResponse(BaseModel):
    status: str
    intervalo_aplicado: str
    linhas_no_sheets: int

class SyncRequest(BaseModel):
    inicio: str
    fim: str
    hora_inicio: str = "00:00"
    hora_fim: str = "23:59"

# =========================================================
# LÓGICA DE SINCRONIZAÇÃO
# =========================================================
def executar_sincronizacao(inicio_str: str, fim_str: str) -> int:
    if aba_destinataria is None:
        raise HTTPException(status_code=500, detail="Google Sheets não conectou (credenciais/aba/planilha).")

    # Parse das datas
    inicio_date = parse_data_yyyy_mm_dd(inicio_str)
    fim_date = parse_data_yyyy_mm_dd(fim_str)

    # aplica limite mínimo
    inicio_date = aplicar_limite_inicio(inicio_date)

    if fim_date < inicio_date:
        raise HTTPException(status_code=400, detail="Data fim não pode ser menor que data início.")

    dt_inicio = datetime(inicio_date.year, inicio_date.month, inicio_date.day, 0, 0, tzinfo=timezone.utc)
    dt_fim = datetime(fim_date.year, fim_date.month, fim_date.day, 23, 59, tzinfo=timezone.utc)

    logger.info(f"Intervalo aplicado: {inicio_date} -> {fim_date} (UTC)")

    col = get_collection()

    pipeline = [
        {"$match": {
            "label": {"$in": ["Cassino", "Vera", "7k"]},
            "createdAt": {"$gte": dt_inicio, "$lte": dt_fim}
        }},
        {"$group": {
            "_id": {
                "dia": {"$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt", "timezone": "UTC"}},
                "casa": "$label",
                "campanha": {"$ifNull": ["$campaignName", "Sem Campanha"]},
                "jogo": {"$ifNull": ["$prize", "Sem Jogo"]},
            },
            "totalAtivacoes": {"$sum": 1},
        }},
        {"$project": {
            "_id": 0,
            "casa": "$_id.casa",
            "campanha": "$_id.campanha",
            "jogo": "$_id.jogo",
            "totalAtivacoes": 1,
            "dia_str": "$_id.dia",
            "dia_date": {"$dateFromString": {"dateString": "$_id.dia"}}
        }},
        {"$addFields": {
            "ano": {"$year": "$dia_date"},
            "mes": {"$month": "$dia_date"},
            "casa_ordem": {
                "$switch": {
                    "branches": [
                        {"case": {"$eq": ["$casa", "7k"]}, "then": 1},
                        {"case": {"$eq": ["$casa", "Cassino"]}, "then": 2},
                        {"case": {"$eq": ["$casa", "Vera"]}, "then": 3},
                    ],
                    "default": 99
                }
            }
        }},
        {"$sort": {"casa_ordem": 1, "dia_str": 1}}
    ]

    t0 = time.time()
    logger.info("Rodando aggregate no Mongo...")

    # maxTimeMS evita ficar infinito “pingando”
    resultados = list(col.aggregate(pipeline, allowDiskUse=True, maxTimeMS=120000))  # 120s

    logger.info(f"Mongo OK. Tempo: {time.time()-t0:.2f}s | Linhas agregadas: {len(resultados)}")

    # Se não tiver dados, limpa e escreve só cabeçalho
    headers = ["Casa", "Campanha", "Jogo", "Total", "Ano", "Mês", "Dia (YYYY-MM-DD)"]
    rows = [headers]

    for r in resultados:
        rows.append([
            r.get("casa"),
            r.get("campanha"),
            r.get("jogo"),
            r.get("totalAtivacoes"),
            r.get("ano"),
            r.get("mes"),
            r.get("dia_str"),
        ])

    # Atualiza planilha
    t1 = time.time()
    aba_destinataria.batch_clear(["A:I"])
    logger.info(f"Sheets batch_clear OK em {time.time()-t1:.2f}s")

    t2 = time.time()
    aba_destinataria.update(f"A1:G{len(rows)}", rows)
    logger.info(f"Sheets update OK em {time.time()-t2:.2f}s")

    return len(resultados)

# =========================================================
# ENDPOINTS
# =========================================================
@app.post("/sync")
async def sync_endpoint(payload: SyncRequest, background_tasks: BackgroundTasks):
    last_sync.update({"status": "queued", "message": "Agendado...", "error": None, "linhas": 0})
    background_tasks.add_task(worker_background, payload.inicio, payload.fim)
    return {"message": "Sincronização iniciada!", "inicio": payload.inicio, "fim": payload.fim}

def worker_background(inicio: str, fim: str):
    try:
        last_sync.update({"status": "running", "message": "Processando...", "error": None, "linhas": 0})
        total = executar_sincronizacao(inicio, fim)
        last_sync.update({"status": "done", "message": "Sucesso!", "linhas": total, "error": None})
    except Exception as e:
        logger.error(f"Erro no background: {e}")
        last_sync.update({"status": "failed", "message": "Erro", "error": str(e), "linhas": 0})

@app.get("/last-sync")
async def get_status():
    return last_sync

@app.get("/puxar-resumo", response_model=ResumoResponse)
async def puxar_resumo(inicio: str, fim: str):
    total = executar_sincronizacao(inicio, fim)
    return {
        "status": "Sucesso",
        "intervalo_aplicado": f"{inicio} a {fim} (inicio minimo: 2025-11-13)",
        "linhas_no_sheets": total
    }

@app.get("/health")
def health():
    return {"status": "ok"}

# =========================================================
# RUN LOCAL
# =========================================================
if __name__ == "__main__":
    import uvicorn

    # IMPORTANTE: NÃO usar reload=True aqui pra não matar background task
    uvicorn.run("main:app", host="0.0.0.0", port=8000)