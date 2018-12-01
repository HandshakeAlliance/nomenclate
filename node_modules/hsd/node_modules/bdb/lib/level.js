/**
 * level.js - database backend for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const binding = require('bindings')('leveldown').leveldown;
binding.leveldown = true;

module.exports = binding;
