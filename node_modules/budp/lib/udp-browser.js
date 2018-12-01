/*!
 * udp.js - udp backend for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

/* eslint prefer-arrow-callback: "off" */

'use strict';

const EventEmitter = require('events');

/**
 * Socket
 * @extends EventEmitter
 */

class Socket extends EventEmitter {
  /**
   * Create a UDP socket.
   * @constructor
   */

  constructor(type) {
    super();
    this.type = type;
  }

  addMembership(addr, iface) {
    return this;
  }

  address() {
    return {
      family: this.type === 'udp6' ? 'IPv6' : 'IPv4',
      address: this.type === 'udp6' ? '::' : '0.0.0.0',
      port: 0
    };
  }

  async bind() {
    this.emit('listening');
  }

  async close() {
    this.emit('close');
  }

  dropMembership(addr, iface) {
    return this;
  }

  getRecvBufferSize() {
    return 0;
  }

  getSendBufferSize() {
    return 0;
  }

  ref() {
    return this;
  }

  async send() {}

  setBroadcast(flag) {
    return this;
  }

  setMulticastInterface(iface) {
    return this;
  }

  setMulticastLoopback(flag) {
    return this;
  }

  setMulticastTTL(ttl) {
    return this;
  }

  setRecvBufferSize(size) {
    return this;
  }

  setSendBufferSize(size) {
    return this;
  }

  setTTL(ttl) {
    return this;
  }

  unref() {
    return this;
  }
}

/*
 * Constants
 */

exports.unsupported = true;

/**
 * Create a UDP socket.
 * @param {Object|String} options
 * @param {Function} cb
 * @returns {Object}
 */

exports.createSocket = function createSocket(options, cb) {
  let type = 'udp4';

  if (typeof options === 'object' && options && options.type)
    type = options.type;
  else if (typeof options === 'string')
    type = options;

  return new Socket(type);
};
