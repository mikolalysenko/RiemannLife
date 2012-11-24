#!/bin/sh
node ./node_modules/browserify-server/bin/browserify-server.js --bundle=./index.js -o ./static/bundle.js
node ./node_modules/browserify-server/bin/browserify-server.js --server=static