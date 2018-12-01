/*!
 * buffer-map.js - buffer map for javascript
 * Copyright (c) 2018, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/buffer-map
 */

'use strict';

const {custom} = require('./custom');

/**
 * Buffer Map
 */

class BufferMap {
  constructor(iterable) {
    this.map = new Map();

    if (iterable != null) {
      for (const [key, value] of iterable)
        this.set(key, value);
    }
  }

  get size() {
    return this.map.size;
  }

  get(key) {
    const item = this.map.get(toKey(key));

    if (!item)
      return undefined;

    return item.value;
  }

  has(key) {
    return this.map.has(toKey(key));
  }

  set(key, value) {
    this.map.set(toKey(key), new BufferItem(key, value));
    return this;
  }

  delete(key) {
    return this.map.delete(toKey(key));
  }

  clear() {
    this.map.clear();
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  *entries() {
    for (const {key, value} of this.map.values())
      yield [key, value];
  }

  *keys() {
    for (const {key} of this.map.values())
      yield key;
  }

  *values() {
    for (const {value} of this.map.values())
      yield value;
  }

  toKeys() {
    const out = [];

    for (const {key} of this.map.values())
      out.push(key);

    return out;
  }

  toValues() {
    const out = [];

    for (const {value} of this.map.values())
      out.push(value);

    return out;
  }

  toArray() {
    return this.toValues();
  }

  [custom]() {
    const map = new Map();

    for (const {key, value} of this.map.values())
      map.set(key.toString('hex'), value);

    return map;
  }
}

/**
 * Buffer Set
 */

class BufferSet {
  constructor(iterable) {
    this.map = new Map();

    if (iterable != null) {
      for (const key of iterable)
        this.add(key);
    }
  }

  get size() {
    return this.map.size;
  }

  has(key) {
    return this.map.has(toKey(key));
  }

  add(key) {
    this.map.set(toKey(key), key);
    return this;
  }

  delete(key) {
    return this.map.delete(toKey(key));
  }

  clear() {
    this.map.clear();
  }

  [Symbol.iterator]() {
    return this.keys();
  }

  *entries() {
    for (const key of this.map.values())
      yield [key, key];
  }

  keys() {
    return this.map.values();
  }

  values() {
    return this.map.values();
  }

  toKeys() {
    const out = [];

    for (const key of this.map.values())
      out.push(key);

    return out;
  }

  toValues() {
    return this.toKeys();
  }

  toArray() {
    return this.toKeys();
  }

  [custom]() {
    const set = new Set();

    for (const key of this.map.values())
      set.add(key.toString('hex'));

    return set;
  }
}

/**
 * Buffer Item
 */

class BufferItem {
  constructor(key, value) {
    this.key = key;
    this.value = value;
  }
}

/*
 * Helpers
 */

function toKey(key) {
  if (!Buffer.isBuffer(key))
    throw new TypeError('Non-buffer passed to buffer map/set.');

  return key.toString('binary');
}

/*
 * Expose
 */

exports.BufferMap = BufferMap;
exports.BufferSet = BufferSet;
