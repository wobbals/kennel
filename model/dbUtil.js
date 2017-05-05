const redis = require('./db');

module.exports.set = function(key, val) {
  return new Promise((resolve, reject) => {
    redis.SET(key, val, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}

module.exports.get = function(key) {
  return new Promise((resolve, reject) => {
    redis.GET(key, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}

module.exports.del = function(key) {
  return new Promise((resolve, reject) => {
    redis.DEL(key, (err, reply) => {
      if (err) {
        reject(err);
      } else {
        resolve(reply);
      }
    });
  });
}

module.exports.hset = function(key, val) {
  return new Promise((resolve, reject) => {
    redis.HSET(key, val, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}

module.exports.hmset = function(key, val) {
  return new Promise((resolve, reject) => {
    redis.HMSET(key, val, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}

module.exports.sadd = function(key, val) {
  return new Promise((resolve, reject) => {
    redis.SADD(key, val, (err, reply) => {
      if (err) {
        reject(err);
      } else {
        resolve(reply);
      }
    });
  });
}

module.exports.srem = function(key, val) {
  return new Promise((resolve, reject) => {
    redis.SREM(key, val, (err, reply) => {
      if (err) {
        reject(err);
      } else {
        resolve(reply);
      }
    });
  });
}

module.exports.smembers = function(key) {
  return new Promise((resolve, reject) => {
    redis.SMEMBERS(key, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}
