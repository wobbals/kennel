const validator = require('validator');
const debug = require('debug')('kennel:task');
const config = require('config');
const queue = require('./jobQueue');
const uuidV4 = require('uuid/v4');
const ecs = require('./aws').ecs;
const taskModel = require('../model/taskModel');

module.exports.describeECSTasks = function(taskIds) {
  debug(`describeECSTasks ${taskIds}`);
  if (taskIds.length < 1) {
    return Promise.resolve({tasks: []});
  }
  return new Promise((resolve, reject) => {
    var params = {
      tasks: taskIds,
      cluster: config.get('ecs_cluster_name')
    };
    ecs.describeTasks(params, function(err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

module.exports.createTask = function(request) {
  let taskId = uuidV4();
  let result = {};
  if (!request.task) {
    return {error: 'missing request parameter: task'};
  }
  let taskDefinition = validator.stripLow(request.task);
  if (!request.container) {
    return {error: 'missing request parameter: container'};
  }
  let containerName = validator.stripLow(request.container);
  if (!request.command) {
    return {error: 'missing request parameter: command'};
  }
  let command = [];
  for (let i in request.command) {
    command.push(validator.stripLow(request.command[i]));
  }
  debug(`command passed: ${request.command}`);
  debug(`command parsed: ${JSON.stringify(command)}`);
  request.environment.TASK_ID = taskId;
  let environment = [];
  for (let key in request.environment) {
    let entry = {};
    entry.name = validator.stripLow(key + '');
    entry.value = validator.stripLow(request.environment[key] + '');
    environment.push(entry);
  }

  debug(`new task request ${taskId} for ${taskDefinition}`);
  let ecsParams =
  {
    taskDefinition: taskDefinition,
    cluster: config.get("ecs_cluster_name"),
    count: 1,
    overrides: {
      containerOverrides: [
        {
          command: command,
          environment: environment,
          name: containerName
        }
      ]
    },
    startedBy: 'kennel-ws',
  };
  let jobData = {
    ecsParams: JSON.stringify(ecsParams),
    taskId: taskId,
    status: 'queued'
  };

  let responseData = {
    taskId: taskId,
    status: 'accepted'
  };

  let p1 = taskModel.createTask(taskId)
  .then(taskModel.registerActiveTask(taskId))
  .then(taskModel.setTaskData(taskId, jobData));

  let p2 = new Promise((resolve, reject) => {
    let job = queue.create('runTask', taskId)
    .removeOnComplete(true)
    .save((err) => {
      if (err) {
        debug(`error queueing runTask: ${err}`);
        result.error = `failed to enqueue task`;
        reject(result);
      } else {
        debug(`job ${job.id} accepted`);
        result.status = 'accepted';
        result.taskId = taskId;
        resolve(result);
      }
    });
  });

  return Promise.resolve(responseData).then(p1).then(p2);
};
