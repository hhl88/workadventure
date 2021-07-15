#!/usr/bin/env bash

rm -rf ../../front/dist/js/*
docker-compose -f docker-compose.build.yaml build front
docker-compose -f docker-compose.build.yaml up front
git add ../../front/dist
