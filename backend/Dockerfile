FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
# optional: built web app served by the API container
COPY web/dist ./../web/dist
ENV PORT=8000
EXPOSE 8000
VOLUME ["/app/data"]
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
