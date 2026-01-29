#!/bin/bash

cleanup(){
    cd ..
}

trap cleanup EXIT

cd frontend
npm run dev