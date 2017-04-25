const redis = require('./db');
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

module.exports.createTask = function(taskId) {
  debug(`createTask: ${taskId}`);
  return new Promise((resolve, reject) => {
    redis.HSET(`task:${taskId}`, 'taskId', taskId, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    })
  });
}

var setTaskStatus = function(taskId, someStatus) {
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
module.exports.setTaskStatus = setTaskStatus;

var setTaskError = function(taskId, errMessage) {
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
module.exports.setTaskError = setTaskError;

var setTaskData = function(taskId, data) {
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
module.exports.setTaskData = setTaskData;

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

var deregisterActiveTask = function(taskId) {
  debug(`deregisterActiveTask: ${taskId}`);
  return new Promise((resolve, reject) => {
    redis.SREM(`kennelActiveTasks`, taskId, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}
module.exports.deregisterActiveTask = deregisterActiveTask;

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

var setTaskArn = function(taskId, arn) {
  debug(`setTaskArn: ${taskId}, ${arn}`);
  let p1 = new Promise((resolve, reject) => {
    redis.HMSET(`task:${taskId}`, {
      arn: arn
    }, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
  let p2 = new Promise((resolve, reject) => {
    redis.SET(arn, taskId, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        debug(`mapped ${arn} to ${taskId}`);
        resolve(obj);
      }
    });
  });
  return p1.then(p2);
}
module.exports.setTaskArn = setTaskArn;

var getTaskIdForArn = function(arn) {
  return new Promise((resolve, reject) => {
    redis.GET(arn, (err, obj) => {
      if (err) {
        reject(err);
      } else {
        resolve(obj);
      }
    });
  });
}
module.exports.getTaskIdForArn = getTaskIdForArn;

module.exports.mergeRunningTaskData = function(taskId, obj) {
  debug(`mergeRunningTaskData: ${taskId}, ${obj}`);
  let taskArn = obj.tasks[0].taskArn;
  let containerInstanceArn = obj.tasks[0].containerInstanceArn;
  return setTaskArn(taskId, taskArn)
  .then(setTaskData(taskId, {
    runningOnInstance: containerInstanceArn,
    status: 'running'
  }));
}

module.exports.mergeECSTaskDescription = function(task) {
  debug(`mergeECSTaskDescription:`);
  debug(task);
  return getTaskIdForArn(task.taskArn)
  .then(taskId => {
    debug(`mergeECSTaskDescription: merge description with ${taskId}`);
    let promises = [];
    if ('STOPPED' === task.lastStatus) {
      promises.push(deregisterActiveTask(taskId));
    }
    promises.push(setTaskStatus(taskId, task.lastStatus));
    let extraData = {};
    if (task.createdAt) {
      extraData.createdAt = task.createdAt;
    }
    if (task.startedAt) {
      extraData.startedAt = task.startedAt;
    }
    if (task.stoppedAt) {
      extraData.stoppedAt = task.stoppedAt;
    }
    if (task.stoppedReason) {
      extraData.stoppedReason = task.stoppedReason;
    }
    promises.push(setTaskData(taskId, extraData));
    return Promise.all(promises);
  });
}

module.exports.purgeTask = function(taskId) {
  return getTask(taskId)
  .then(task => {
    redis.DEL(taskId, task.arn);
  })
  .then(deregisterActiveTask(taskId));
}
