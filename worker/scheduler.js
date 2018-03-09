const config = require('config');
const debug = require('debug')('worker:scheduler');
const queue = require('../helper/jobQueue');
const cluster = require('../helper/cluster');
const taskModel = require('../model/taskModel');
const instanceModel = require('../model/instanceModel');
const instanceHelper = require('../helper/instance');
const taskHelper = require('../helper/task');

queue.process('runTask', function(job, done){
  runTask(job.data, true).then(() => {
    done();
  })
  .catch(err => {
    debug(`runTask processing error: ${err}`);
    done();
  });
});

queue.process('clusterResize', function(job, done) {
  cluster.autoResize();
  done();
});

queue.on('error', err => {
  debug(err);
});

process.on('uncaughtException', err => {
  console.error( 'Something bad happened: ', err );
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, p) => {
  console.error('unhandled rejection: ' + JSON.stringify(reason, null, ' '));
  console.error(p);
  console.error(reason.stack);
});

debug(`connected to queue redis at ${queue.client.address}`);
debug(`worker standing by`);

async function handleNoResources(taskId) {
  await instanceHelper.launchSpotInstance(taskId);
  await taskModel.setTaskStatus(taskId, 'waitingForCluster');
}

function runTaskImmediately(taskId, ecsParams) {
  debug(`runTaskImmediately: taskId=${taskId}, ecsParams=${ecsParams}`);
  return cluster.runTask(ecsParams)
  .then(result => {
    let p1 = taskModel.mergeRunningTaskData(taskId, result);
    let p2 = cluster.markRunningInstance(result);
    return Promise.all([p1, p2]);
  });
}

async function runTask(taskId, force) {
  try {
    debug(`runTask: taskId=${taskId} force=${force}`);
    let taskData = {};
    let ecsParams = {};
    let task = await taskModel.getTask(taskId);
    taskData = task;
    ecsParams = JSON.parse(task.ecsParams);
    if (force && 'deferred' === taskData.status) {
      debug(`runTask: taskId=${taskId}: forcing deferred task to queue`);
      taskData.status = 'queued';
      await taskModel.setTaskData(taskId, taskData);
    } else if (!force && 'deferred' === taskData.status) {
      debug(`runTask: taskId=${taskId} is deferred and not ready to run.`);
      return Promise.resolve();
    }
    let hasResources = await cluster.canRunTaskImmediately(ecsParams, taskId);

    if (!hasResources) {
      debug(`no instances available. launch instance and try again later`);
      return handleNoResources(taskId);
    } else {
      debug(`task ${taskId} can be scheduled immediately`);
      return runTaskImmediately(taskId, ecsParams);
    }
  } catch (err) {
    debug(`runTask: error!`, err);
  }
};

function refreshInstanceECSDescriptions() {
  return cluster.getContainerInstances()
  .then(cluster.describeContainerInstances)
  .then(cluster.mergeECSInstanceDescriptions);
}

function printCachedInstanceData() {
  return cluster.getContainerInstances()
  .then(containerInstanceIds => {
    let promises = [];
    containerInstanceIds.forEach(id => {
      debug(`print cached data for ${id}`);
      promises.push(
        instanceModel.getInstanceIdForArn(id)
        .then(instanceModel.getInstance)
        .then(instance => {
          debug(instance);
        })
      );
    });
    return Promise.all(promises);
  })
}

function refreshTaskECSDescriptions() {
  return taskModel.getActiveTasks()
  .then(tasks => {
    debug('task details(redis):');
    debug(tasks);
    let taskArns = [];
    tasks.forEach(task => {
      if (task.arn) {
        taskArns.push(task.arn);
      }
    });
    return taskHelper.describeECSTasks(taskArns);
  })
  .then(ecsTaskDescriptions => {
    let promises = [];
    ecsTaskDescriptions.tasks.forEach(task => {
      promises.push(taskModel.mergeECSTaskDescription(task));
    });
    return Promise.all(promises);
  });
}

async function runPendingJobs() {
  let instances = await cluster.getContainerInstances();
  let pendingInstanceIds = await instanceModel.getPendingInstances();
  debug(`runPendingJobs: working with ${instances.length} active instances`);
  let tasks = await taskModel.getActiveTasks();
  debug('runPendingJobs: iterating over task list');
  for (let index in tasks) {
    let task = tasks[index];
    debug(JSON.stringify(task));
    if ('queued' === task.status || 'waitingForCluster' === task.status) {
      await runTask(task.taskId, false);
    }
  };
}

async function daemonMain() {
  try {
    debug(`daemonMain: refresh ECS data`);
    await refreshInstanceECSDescriptions();
    await refreshTaskECSDescriptions();
    debug(`daemonMain: dump cache`);
    await printCachedInstanceData();
    debug(`daemonMain: run pending jobs`);
    await runPendingJobs();
    debug(`daemonMain: resize cluster`);
    await cluster.autoResize();
  } catch (err) {
    debug(`daemonMain: ${JSON.stringify(err, null, ' ')}`);
    debug(err.stack);
  }
}

setInterval(daemonMain, config.get('daemonInterval'));
daemonMain();
// setInterval(daemonMain, 600000 /* 10 minutes */);
// cluster.autoResize();