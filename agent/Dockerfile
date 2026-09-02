FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# The agent is a persistent WORKER process, not a request/response server.
# Local dev:  python app/main.py dev
# Production: python app/main.py start
CMD ["python", "app/main.py", "start"]
