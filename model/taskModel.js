const redis = require('redis').createClient();
const debug = require('debug')('kennel:model:task');

module.exports.getTask = function(taskId) {
  return new Promise((resolve, reject) => {
    redis.HGETALL(`task:${taskId}`, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}

module.exports.setTaskStatus = function(taskId, someStatus) {
  debug(`setTaskStatus: ${taskId}, ${someStatus}`);
  return new Promise((resolve, reject) => {
    redis.HMSET(`task:${taskId}`, {
      status: someStatus
    }, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}

module.exports.setTaskError = function(taskId, errMessage) {
  debug(`setTaskError: ${taskId}, ${errMessage}`);
  return new Promise((resolve, reject) => {
    redis.HMSET(`task:${taskId}`, {
      status: 'error',
      message: errMessage
    }, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}

module.exports.setTaskData = function(taskId, data) {
  debug(`setTaskData: ${taskId}, ${JSON.stringify(data)}`);
  return new Promise((resolve, reject) => {
    redis.HMSET(`task:${taskId}`, data, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}

module.exports.registerActiveTask = function(taskId) {
  debug(`registerActiveTask: ${taskId}`);
  return new Promise((resolve, reject) => {
    redis.SADD(`kennelActiveTasks`, taskId, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}

module.exports.getActiveTasks = function() {
  return new Promise((resolve, reject) => {
    redis.SMEMBERS(`kennelActiveTasks`, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}
