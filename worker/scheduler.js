const kue = require('kue');
const queue = kue.createQueue();
const cluster = require('../helper/cluster');
const debug = require('debug')('worker:scheduler');
const taskModel = require('../model/taskModel');
const instanceModel = require('../model/instanceModel');
const taskHelper = require('../helper/task');

queue.process('runTask', function(job, done){
  runTask(job).then(() => {
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

queue.on( 'error', err => {
  debug(err);
});

process.on('uncaughtException', err => {
  console.error( 'Something bad happened: ', err );
  console.error(reason.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, p) => {
  console.error('unhandled rejection: ' + reason);
  console.error(reason.stack);
  process.exit(1);
});

debug(`connected to queue redis at ${queue.client.address}`);
debug(`worker standing by`);

function handleNoResources(job) {
  return cluster.launchInstance()
  .then(() => {
    tryAgainLater(job, 180);
  });
}

function runTaskImmediately(taskId, ecsParams) {
  return cluster.runTask(ecsParams)
  .then(result => {
    let p1 = taskModel.mergeRunningTaskData(taskId, result);
    let p2 = cluster.markRunningInstance(result);
    return Promise.all([p1, p2]);
  });
}

function runTask(job) {
  let taskId = job.data.taskId;
  return cluster.canRunTaskImmediately(job.data.ecsParams)
  .then((hasResources) => {
    if (!hasResources) {
      debug(`no instances available. launch instance and try again later`);
      return handleNoResources(job);
    } else {
      debug(`task ${taskId} can be scheduled immediately`);
      return runTaskImmediately(taskId, job.data.ecsParams);
    }
  });
};

function tryAgainLater(job, seconds) {
  debug(`tryAgainLater: ${job.id}, ${seconds}`);
  let taskId = job.data.taskId;
  let deferredJob = queue.create('runTask', job.data)
  .delay(seconds * 1000)
  .priority('high')
  .removeOnComplete(true)
  .save();
  taskModel.setTaskStatus(taskId, 'waitingForCluster')
  .catch(err => {
    debug(err);
  });
  debug(`Retry task ${taskId} in ${seconds} seconds`);
}

function scheduleCleanup(taskArns, seconds) {
  debug(`scheduleCleanup: check in on tasks ${taskArns} in ${seconds} seconds`);
  let deferredJob = queue.create('cleanup', taskArns)
  .delay(seconds * 1000)
  .removeOnComplete(true)
  .save();
}

function resizeAfter(seconds) {
  debug(`resizeAfter: request cluster resize in ${seconds} seconds`);
  let deferredJob = queue.create('clusterResize', {})
  .delay(seconds * 1000)
  .removeOnComplete(true)
  .save();
}

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
  .then(taskIds => {
    debug('active tasks(redis):');
    debug(taskIds);
    let taskGets = [];
    taskIds.forEach(taskId => {
      taskGets.push(taskModel.getTask(taskId));
    });
    return Promise.all(taskGets);
    //cluster.autoResize();
  })
  .then(tasks => {
    debug('task details(redis):');
    debug(tasks);
    let taskArns = [];
    tasks.forEach(task => {
      if (task.arn) {
        taskArns.push(task.arn);
      }
    });
    return taskHelper.describeTasks(taskArns);
  })
  .then(ecsTaskDescriptions => {
    let promises = [];
    ecsTaskDescriptions.tasks.forEach(task => {
      promises.push(taskModel.mergeECSTaskDescription(task));
    });
    return Promise.all(promises);
  });
}

function daemonMain() {
  refreshInstanceECSDescriptions()
  .then(printCachedInstanceData())
  .then(refreshTaskECSDescriptions())
  .then(cluster.autoResize())
  .catch(err => {
    debug(`daemon: mistakes were made.`);
    debug(err);
    debug(err.stack);
  });
}

setInterval(daemonMain, 60000);
daemonMain();
// setInterval(daemonMain, 600000 /* 10 minutes */);
// cluster.autoResize();