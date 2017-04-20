const validator = require('validator');
const debug = require('debug')('kennel:task');
const config = require('config');
const kue = require('kue');
const queue = kue.createQueue();
const uuidV4 = require('uuid/v4');
const taskModel = require('../model/taskModel');

module.exports.createTask = function(request) {
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
  let command = validator.stripLow(request.command);
  let environment = [];
  for (let key in request.environment) {
    let entry = {};
    entry.name = validator.stripLow(key + '');
    entry.value = validator.stripLow(request.environment[key] + '');
    environment.push(entry);
  }

  let taskId = uuidV4();
  debug(`new task request ${taskId} for ${taskDefinition}`);
  let ecsParams =
  {
    taskDefinition: taskDefinition,
    cluster: config.get("ecs_cluster_name"),
    count: 1,
    overrides: {
      containerOverrides: [
        {
          command: command.split(' '),
          environment: environment,
          name: containerName
        }
      ]
    },
    startedBy: 'kennel-ws',
  };
  let jobData = {
    ecsParams: ecsParams,
    taskId: taskId
  };

  return new Promise((resolve, reject) => {
    let job = queue.create('runTask', jobData)
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
        taskModel.registerActiveTask(taskId);
        taskModel.setTaskData(taskId, {
          status: 'queued',
          kueJobId: job.id
        });
        resolve(result);
      }
    });
  });
};
