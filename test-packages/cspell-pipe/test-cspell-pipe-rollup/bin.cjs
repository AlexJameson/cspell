#!/usr/bin/env node

const assert = require('assert');
const { sumValues } = require('./dist/index.cjs');

assert(sumValues([1, 2, 3]) === 6);
