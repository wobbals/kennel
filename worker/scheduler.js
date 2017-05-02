const debug = require('debug')('worker:scheduler');
const queue = require('../helper/jobQueue');
const cluster = require('../helper/cluster');
const taskModel = require('../model/taskModel');
const instanceModel = require('../model/instanceModel');
const taskHelper = require('../helper/task');

queue.process('runTask', function(job, done){
  runTask(job.data).then(() => {
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

function handleNoResources(taskId) {
  return cluster.launchInstance()
  .then(taskModel.setTaskStatus(taskId, 'waitingForCluster'));
}

function runTaskImmediately(taskId, ecsParams) {
  return cluster.runTask(ecsParams)
  .then(result => {
    let p1 = taskModel.mergeRunningTaskData(taskId, result);
    let p2 = cluster.markRunningInstance(result);
    return Promise.all([p1, p2]);
  });
}

function runTask(taskId) {
  var taskData = {};
  var ecsParams = {};
  return taskModel.getTask(taskId)
  .then(task => {
    taskData = task;
    ecsParams = JSON.parse(task.ecsParams);
    return cluster.canRunTaskImmediately(ecsParams)
  })
  .then((hasResources) => {
    if (!hasResources) {
      debug(`no instances available. launch instance and try again later`);
      return handleNoResources(taskId);
    } else {
      debug(`task ${taskId} can be scheduled immediately`);
      return runTaskImmediately(taskId, ecsParams);
    }
  });
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
  var tryTasksAgain = [];
  return taskModel.getActiveTasks()
  .then(taskIds => {
    debug('active tasks(redis):');
    debug(taskIds);
    let taskGets = [];
    taskIds.forEach(taskId => {
      taskGets.push(taskModel.getTask(taskId));
    });
    return Promise.all(taskGets);
  })
  .then(tasks => {
    debug('task details(redis):');
    debug(tasks);
    let taskArns = [];
    tasks.forEach(task => {
      if (task.arn) {
        taskArns.push(task.arn);
      }
      if ('waitingForCluster' === task.status) {
        debug(`task ${task.taskId} needs to run!`);
        // TODO: This should only fire if an instance has become available.
        // otherwise, we'll probably end up launching more instances than
        // needed.
        tryTasksAgain.push(task.taskId);
      }
      if ('queued' === task.status) {
        debug(`task ${task.taskId} is queued and unprocessed. rerunning.`);
        // kue job hasn't run yet... why?
        tryTasksAgain.push(task.taskId);
      }
    });
    return taskHelper.describeTasks(taskArns);
  })
  .then(ecsTaskDescriptions => {
    let promises = [];
    ecsTaskDescriptions.tasks.forEach(task => {
      promises.push(taskModel.mergeECSTaskDescription(task));
    });
    tryTasksAgain.forEach(taskId => {
      promises.push(runTask(taskId));
    });
    return Promise.all(promises);
  });
}

function daemonMain() {
  // Clean this up: Run all async getters. Once all data is available in
  // one place, then perform scheduling/terminations/etc as needed.
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