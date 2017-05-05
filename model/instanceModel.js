const redis = require('./db');
const debug = require('debug')('kennel:model:instance');
const db = require('./dbUtil');

var setLaunchTimeout = function() {
  debug(`setLaunchTimeout`);
  return db.set('launchTimeout', new Date().getTime());
}
module.exports.setLaunchTimeout = setLaunchTimeout;

var clearLaunchTimeout = function() {
  debug(`clearLaunchTimeout`);
  return db.del('launchTimeout');
}
module.exports.clearLaunchTimeout = clearLaunchTimeout;

var getLaunchTimeout = function() {
  debug(`getLaunchTimeout`);
  return db.get('launchTimeout');
}
module.exports.getLaunchTimeout = getLaunchTimeout;

module.exports.registerInstance = function(instanceId) {
  debug(`registerInstance: ${instanceId}`);
  let p1 = db.hmset(`instance:${instanceId}`, {
    createdAt: new Date().getTime(),
    instanceId: instanceId
  });
  let p2 = db.sadd('pendingInstances', instanceId);
  return Promise.all([p1, p2]);
};

module.exports.getPendingInstances = function() {
  return db.smembers('pendingInstances');
};

const clearPendingInstance = function(instanceId) {
  debug(`clearPendingInstance: ${instanceId}`);
  return db.srem('pendingInstances', instanceId);
}
module.exports.clearPendingInstance = clearPendingInstance;

var setInstanceArn = function(instanceId, arn) {
  debug(`setInstanceArn: ${instanceId}, ${arn}`);
  let p1 = db.hmset(`instance:${instanceId}`, {
    arn: arn
  });
  let p2 = db.set(arn, instanceId);
  return p1.then(p2);
}
module.exports.setInstanceArn = setInstanceArn;

var getInstanceIdForArn = function(arn) {
  return db.get(arn);
}
module.exports.getInstanceIdForArn = getInstanceIdForArn;

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

var getIdleSince = function(instanceId) {
  debug(`getIdleSince: ${instanceId}`);
  return new Promise((resolve, reject) => {
    redis.HGET(`instance:${instanceId}`, 'idleSince', (err, reply) => {
      if (err) {
        reject(err);
      } else {
        resolve(reply);
      }
    });
  });
}
module.exports.getIdleSince = getIdleSince;

var setIdleSince = function(instanceId, since) {
  debug(`setIdleSince: ${instanceId}: ${since}`);
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

module.exports.setInstanceData = function(instanceId, data) {
  debug(`setInstanceData: ${instanceId}, ${JSON.stringify(data)}`);
  return new Promise((resolve, reject) => {
    redis.HMSET(`instance:${instanceId}`, data, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}

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
