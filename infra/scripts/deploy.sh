#!/bin/bash
set -e

echo "Pulling latest..."
git pull origin master

echo "Building and starting services..."
docker-compose -f infra/docker-compose.prod.yml up -d --build

echo "Running DB migrations..."
docker-compose -f infra/docker-compose.prod.yml exec rei-hub-backend \
  python -m alembic upgrade head

echo "Deploy complete."
