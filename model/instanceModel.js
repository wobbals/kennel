const redis = require('redis').createClient();
const debug = require('debug')('kennel:model:instance');

module.exports.registerInstance = function(instanceId) {
  return new Promise((resolve, reject) => {
    redis.HSET(
      `instance:${instanceId}`,
      'createdAt', new Date().getTime(),
      (err, reply) => {
        if (err) {
          reject(err);
        } else {
          resolve(reply);
        }
      });
    }
  );
};

var removeTask = function(instanceId, taskId) {
  debug(`removeTask: ${instanceId}, ${taskId}`);
  return new Promise((resolve, reject) => {
    redis.SREM(`instance:${instanceId}:tasks`, taskId, (err, reply) => {
      if (err) {
        reject(err);
      } else {
        resolve(reply);
      }
    });
  });
};

var addTask = function(instanceId, taskId) {
  debug(`addTask: ${instanceId}, ${taskId}`);
  return new Promise((resolve, reject) => {
    redis.SADD(`instance:${instanceId}:tasks`, taskId, (err, reply) => {
      if (err) {
        reject(err);
      } else {
        resolve(reply);
      }
    });
  });
};

var clearIdleSince = function(instanceId) {
  debug(`clearIdleSince: ${instanceId}`);
  return new Promise((resolve, reject) => {
    redis.HDEL(`instance:${instanceId}`, 'idleSince', (err, reply) => {
      if (err) {
        reject(err);
      } else {
        resolve(reply);
      }
    });
  });
}
module.exports.clearIdleSince = clearIdleSince;

var setIdleSince = function(instanceId, since) {
  debug(`setIdleSince: ${instanceId}`);
  return new Promise((resolve, reject) => {
    redis.HSET(
      `instance:${instanceId}`,
      'idleSince', since.getTime(),
      (err, reply) => {
        if (err) {
          reject(err);
        } else {
          resolve(reply);
        }
      });
    }
  );
}
module.exports.setIdleSince = setIdleSince;

module.exports.registerInstanceTaskStarted = function(instanceId, taskId) {
  debug(`registerInstanceTaskStarted: ${instanceId}, ${taskId}`);
  return new Promise((resolve, reject) => {
    addTask(instanceId, taskId)
    .then(clearIdleSince(instanceId))
    .then(getInstance(instanceId))
    .then(instance => {
      resolve(instance);
    })
    .catch(err => {
      reject(err);
    });
  });
};

module.exports.registerInstanceTaskStopped = function(instanceId, taskId) {
  let now = new Date();
};

var getInstance = function(instanceId) {
  debug(`getInstance: ${instanceId}`);
  return new Promise((resolve, reject) => {
    redis.HGETALL(`instance:${instanceId}`, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}
module.exports.getInstance = getInstance;

module.exports.getInstanceTasks = function(instanceId) {
  debug(`getInstanceTasks: ${instanceId}`);
  return new Promise((resolve, reject) => {
    redis.SMEMBERS(`instance:${instanceId}:tasks`, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}
