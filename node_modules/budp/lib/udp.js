/*!
 * udp.js - udp backend for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

/* eslint prefer-arrow-callback: "off" */

'use strict';

const EventEmitter = require('events');
const dgram = require('dgram');

/**
 * Socket
 * @extends EventEmitter
 */

class Socket extends EventEmitter {
  /**
   * Create a UDP socket.
   * @constructor
   * @param {Function?} handler
   */

  constructor(socket) {
    super();

    this.socket = socket;

    this.socket.on('close', () => {
      this.emit('close');
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    this.socket.on('listening', () => {
      this.emit('listening');
    });

    this.socket.on('message', (msg, rinfo) => {
      this.emit('message', msg, rinfo);
    });
  }

  addMembership(addr, iface) {
    this.socket.addMembership(addr, iface);
    return this;
  }

  address() {
    return this.socket.address();
  }

  async bind(...args) {
    return new Promise((resolve, reject) => {
      args.push(wrap(resolve, reject));
      this.socket.bind(...args);
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.socket.close(wrap(resolve, reject));
    });
  }

  dropMembership(addr, iface) {
    this.socket.dropMembership(addr, iface);
    return this;
  }

  getRecvBufferSize() {
    return this.socket.getRecvBufferSize();
  }

  getSendBufferSize() {
    return this.socket.getSendBufferSize();
  }

  ref() {
    this.socket.ref();
    return this;
  }

  async send(...args) {
    return new Promise((resolve, reject) => {
      args.push(resolve);
      try {
        this.socket.send(...args);
      } catch (e) {
        ;
      }
    });
  }

  setBroadcast(flag) {
    this.socket.setBroadcast(flag);
    return this;
  }

  setMulticastInterface(iface) {
    this.socket.setMulticastInterface(iface);
    return this;
  }

  setMulticastLoopback(flag) {
    this.socket.setMulticastLoopback(flag);
    return this;
  }

  setMulticastTTL(ttl) {
    this.socket.setMulticastTTL(ttl);
    return this;
  }

  setRecvBufferSize(size) {
    this.socket.setRecvBufferSize(size);
    return this;
  }

  setSendBufferSize(size) {
    this.socket.setSendBufferSize(size);
    return this;
  }

  setTTL(ttl) {
    this.socket.setTTL(ttl);
    return this;
  }

  unref() {
    this.socket.unref();
    return this;
  }
}

/*
 * Constants
 */

exports.unsupported = false;

/**
 * Create a UDP socket.
 * @param {Object|String} options
 * @param {Function} cb
 * @returns {Object}
 */

exports.createSocket = function createSocket(options, cb) {
  const socket = dgram.createSocket(options, cb);
  return new Socket(socket);
};

/*
 * Helpers
 */

function wrap(resolve, reject) {
  return function(err, result) {
    if (err) {
      reject(err);
      return;
    }
    resolve(result);
  };
}
