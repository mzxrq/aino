# syntax=docker/dockerfile:1

FROM python:3.11-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends build-essential wget && rm -rf /var/lib/apt/lists/*

# Install deps
COPY backend-python/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY backend-python/app ./app

# Expose port
EXPOSE 5000

# Healthcheck (adjust path)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

# Start uvicorn
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
