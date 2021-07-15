#!/usr/bin/env bash

echo "====== Clearing dist js ======"
rm -rf ../../front/dist/js/*
echo "====== Preparing container ======"
docker-compose -f docker-compose.build.yaml build front
echo "====== Building dist ======"
docker-compose -f docker-compose.build.yaml up front
echo "====== Closing container ======"
docker-compose down
echo "====== Adding to git ======"
git add ../../front/dist
echo "====== DONE ======"
