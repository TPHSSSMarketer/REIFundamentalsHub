FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy application
COPY helm/ helm/
COPY frontend/ frontend/

EXPOSE 8000

CMD ["uvicorn", "helm.main:app", "--host", "0.0.0.0", "--port", "8000"]
