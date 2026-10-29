const {
  AsyncLocalStorage
} = require('node:async_hooks');

const requestStorage = new AsyncLocalStorage();

module.exports = {
  requestStorage
};
