# PRITHVI AI API image. Build from the repository root (the API reads data/processed and imports ai-engine):
#   docker build -t prithvi-api .   &&   docker run -p 8000:8000 -e PRITHVI_CORS_ORIGINS=http://localhost:5173 prithvi-api
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app

# runtime dependencies only (pytest/httpx are for tests)
RUN pip install --no-cache-dir "fastapi>=0.110" "uvicorn[standard]>=0.29" "numpy>=1.26" "pydantic>=2.6"

COPY backend ./backend
COPY ai-engine ./ai-engine
COPY data/processed ./data/processed

RUN useradd --system --no-create-home app
USER app
WORKDIR /app/backend

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s CMD python -c "import os,urllib.request;urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health',timeout=3)"
# one worker: scenarios are kept in memory and the solver endpoint is single-flight
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
